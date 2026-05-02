import { observable } from "@trpc/server/observable";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { InferenceClient } from "../../../inference/client.ts";
import {
  BackendSchema,
  ClassifyResultSchema,
  EmbedResultSchema,
  GenerateOptionsSchema,
  GenerateResultSchema,
  HealthResultSchema,
  InferenceModelSchema,
  ModelPullProgressSchema,
  TokenizeResultSchema,
  type ModelPullProgress,
} from "../../../inference/protocol.ts";
import { INFERENCE_CLIENT_TOKEN } from "../../../inference/tokens.ts";
import { FlagRegistry } from "../../../flags/registry.ts";
import { t, publicProcedure } from "../../../trpc/trpc.ts";
import { protectedProcedure } from "../../../trpc/middleware.ts";
import type { TRPCContext } from "../../../trpc/context.ts";

const MAX_TEXT_ITEMS = 64;
const MAX_TEXT_CHARS = 20_000;
const MAX_LABELS = 100;
const MAX_MODEL_ID_CHARS = 200;

const EmbedInputSchema = z.object({
  texts: z.array(z.string().min(1).max(MAX_TEXT_CHARS)).min(1).max(MAX_TEXT_ITEMS),
  model: z.string().max(MAX_MODEL_ID_CHARS).optional(),
});

const GenerateInputSchema = z.object({
  prompt: z.string().min(1).max(MAX_TEXT_CHARS),
  options: GenerateOptionsSchema,
});

const ClassifyInputSchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_CHARS),
  labels: z.array(z.string().min(1).max(200)).min(1).max(MAX_LABELS),
});

const TokenizeInputSchema = z.object({
  text: z.string().max(MAX_TEXT_CHARS),
  model: z.string().max(MAX_MODEL_ID_CHARS).optional(),
});

const ModelInputSchema = z.object({
  modelId: z.string().min(1).max(MAX_MODEL_ID_CHARS),
  force: z.boolean().optional(),
});

async function getOrgClass() {
  const { Org } = await import("../../../db/entities/auth/Org.ts");
  return Org;
}

async function getModelCacheClass() {
  const { ModelCache } = await import("../../../db/entities/inference/ModelCache.ts");
  return ModelCache;
}

async function syncModelDownloaded(ctx: TRPCContext, modelId: string): Promise<void> {
  if (!ctx.em || !ctx.orgId) return;
  const Org = await getOrgClass();
  const org = await ctx.em.findOne(Org, { id: ctx.orgId } as never);
  if (!org) return;
  const client = await resolveClient(ctx);
  const model = (await client.listModels()).find((item) => item.id === modelId);
  if (!model) return;
  const ModelCache = await getModelCacheClass();
  const repo = ctx.em.getRepository(ModelCache) as unknown as {
    markDownloaded(input: {
      org: typeof org;
      modelId: string;
      kind: string;
      sizeBytes?: number;
    }): Promise<unknown>;
  };
  await repo.markDownloaded({
    org,
    modelId,
    kind: model.kind,
    sizeBytes: model.sizeBytesActual ?? model.sizeBytes,
  });
}

async function syncModelMissing(ctx: TRPCContext, modelId: string): Promise<void> {
  if (!ctx.em || !ctx.orgId) return;
  const Org = await getOrgClass();
  const org = await ctx.em.findOne(Org, { id: ctx.orgId } as never);
  if (!org) return;
  const ModelCache = await getModelCacheClass();
  const repo = ctx.em.getRepository(ModelCache) as unknown as {
    markMissing(input: { org: typeof org; modelId: string }): Promise<unknown>;
  };
  await repo.markMissing({ org, modelId });
}

async function findBoundClient(container: TRPCContext["container"]): Promise<InferenceClient | null> {
  if (!container) return null;

  if (container.has(INFERENCE_CLIENT_TOKEN)) {
    return container.get(INFERENCE_CLIENT_TOKEN);
  }

  const { InferenceClient } = await import("../../../inference/client.ts");
  if (container.has(InferenceClient)) {
    return container.get(InferenceClient);
  }

  return null;
}

async function createDefaultClient(): Promise<InferenceClient> {
  const { InferenceClient } = await import("../../../inference/client.ts");
  return new InferenceClient();
}

async function resolveClient(ctx: TRPCContext): Promise<InferenceClient> {
  return (await findBoundClient(ctx.container)) ?? await createDefaultClient();
}

async function resolveBoundClient(ctx: TRPCContext): Promise<InferenceClient | null> {
  return findBoundClient(ctx.container);
}

async function isEnabled(ctx: TRPCContext, flag: "embeddings" | "router-llm" | "external-llm-provider"): Promise<boolean> {
  if (ctx.container?.has(FlagRegistry)) {
    return ctx.container.get(FlagRegistry).isEnabled(flag, {
      orgId: ctx.orgId ?? undefined,
      userId: ctx.userId ?? undefined,
    });
  }

  return (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .includes(flag);
}

async function assertEmbeddingsEnabled(ctx: TRPCContext): Promise<void> {
  if (!ctx.orgId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Session is missing orgId. Re-authenticate.",
    });
  }
  if (!(await isEnabled(ctx, "embeddings"))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Inference classify/tokenize require the embeddings feature flag.",
    });
  }
}

async function defaultBackends(ctx: TRPCContext) {
  const configured = process.env["FULCRUM_INFERENCE_BACKEND"] ?? "embedded";
  const embeddings = await isEnabled(ctx, "embeddings");
  const routerLlm = await isEnabled(ctx, "router-llm");
  const external = await isEnabled(ctx, "external-llm-provider");
  const localBackendEnabled = embeddings || routerLlm;

  return [
    {
      id: "embedded" as const,
      available: true,
      active: configured === "embedded",
      reason: null,
    },
    {
      id: "ollama" as const,
      available: localBackendEnabled,
      active: configured === "ollama",
      reason: localBackendEnabled ? null : "flag disabled",
    },
    {
      id: "lm-studio" as const,
      available: localBackendEnabled,
      active: configured === "lm-studio",
      reason: localBackendEnabled ? null : "flag disabled",
    },
    {
      id: "openai-compatible" as const,
      available: external,
      active: configured === "openai-compatible",
      reason: external ? null : "flag disabled",
    },
  ];
}

function toTrpcError(error: unknown): TRPCError {
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : "Inference request failed",
    cause: error,
  });
}

export const inferenceRouter = t.router({
  health: publicProcedure
    .output(HealthResultSchema)
    .query(async ({ ctx }) => (await resolveClient(ctx)).health()),

  embed: protectedProcedure
    .input(EmbedInputSchema)
    .output(EmbedResultSchema)
    .query(async ({ ctx, input }) => (await resolveClient(ctx)).embed(input.texts, { model: input.model })),

  generate: protectedProcedure
    .input(GenerateInputSchema)
    .output(GenerateResultSchema)
    .query(async ({ ctx, input }) => (await resolveClient(ctx)).generate(input.prompt, input.options)),

  classify: protectedProcedure
    .input(ClassifyInputSchema)
    .output(ClassifyResultSchema)
    .query(async ({ ctx, input }) => {
      await assertEmbeddingsEnabled(ctx);
      return (await resolveClient(ctx)).classify(input.text, input.labels);
    }),

  tokenize: protectedProcedure
    .input(TokenizeInputSchema)
    .output(TokenizeResultSchema)
    .query(async ({ ctx, input }) => {
      await assertEmbeddingsEnabled(ctx);
      return (await resolveClient(ctx)).tokenize(input.text, input.model);
    }),

  models: t.router({
    list: publicProcedure
      .output(InferenceModelSchema.array())
      .query(async ({ ctx }) => (await resolveClient(ctx)).listModels()),

    pull: protectedProcedure
      .input(ModelInputSchema)
      .subscription(({ ctx, input }) => {
        return observable<ModelPullProgress>((emit) => {
          let cancelled = false;
          let iterator: AsyncIterator<ModelPullProgress> | null = null;

          void (async () => {
            try {
              const client = await resolveClient(ctx);
              iterator = client.pullModel(input.modelId, { force: input.force ?? false })[Symbol.asyncIterator]();
              while (!cancelled) {
                const event = await iterator.next();
                if (event.done) break;
                if (!cancelled) emit.next(ModelPullProgressSchema.parse(event.value));
              }
              if (!cancelled) await syncModelDownloaded(ctx, input.modelId);
              if (!cancelled) emit.complete();
            } catch (error) {
              if (cancelled) return;
              emit.error(toTrpcError(error));
            }
          })();

          return () => {
            cancelled = true;
            void iterator?.return?.();
          };
        });
      }),

    rm: protectedProcedure
      .input(ModelInputSchema)
      .output(z.object({ ok: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const result = await (await resolveClient(ctx)).rmModel(input.modelId);
        await syncModelMissing(ctx, input.modelId);
        return result;
      }),
  }),

  backends: t.router({
    list: publicProcedure
      .output(BackendSchema.array())
      .query(async ({ ctx }) => {
        // Keep backend discovery bound-client only so SSR settings load can show
        // feature-gated defaults without importing or starting the decorated client.
        const client = await resolveBoundClient(ctx);
        if (client) return client.listBackends();
        return defaultBackends(ctx);
      }),
  }),
});

export type InferenceRouter = typeof inferenceRouter;
