import { observable } from "@trpc/server/observable";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { InferenceClient } from "../../../inference/client.ts";
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
import { FlagRegistry } from "../../../flags/registry.ts";
import { t, publicProcedure } from "../../../trpc/trpc.ts";
import type { TRPCContext } from "../../../trpc/context.ts";

const EmbedInputSchema = z.object({
  texts: z.array(z.string().min(1)).min(1),
  model: z.string().optional(),
});

const GenerateInputSchema = z.object({
  prompt: z.string().min(1),
  options: GenerateOptionsSchema,
});

const ClassifyInputSchema = z.object({
  text: z.string().min(1),
  labels: z.array(z.string().min(1)).min(1),
});

const TokenizeInputSchema = z.object({
  text: z.string(),
  model: z.string().optional(),
});

const ModelInputSchema = z.object({
  modelId: z.string().min(1),
});

function resolveClient(ctx: TRPCContext): InferenceClient {
  if (ctx.container?.has(InferenceClient)) {
    return ctx.container.get(InferenceClient);
  }
  return new InferenceClient();
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
    .query(async ({ ctx }) => resolveClient(ctx).health()),

  embed: publicProcedure
    .input(EmbedInputSchema)
    .output(EmbedResultSchema)
    .query(async ({ ctx, input }) => resolveClient(ctx).embed(input.texts, { model: input.model })),

  generate: publicProcedure
    .input(GenerateInputSchema)
    .output(GenerateResultSchema)
    .query(async ({ ctx, input }) => resolveClient(ctx).generate(input.prompt, input.options)),

  classify: publicProcedure
    .input(ClassifyInputSchema)
    .output(ClassifyResultSchema)
    .query(async ({ ctx, input }) => resolveClient(ctx).classify(input.text, input.labels)),

  tokenize: publicProcedure
    .input(TokenizeInputSchema)
    .output(TokenizeResultSchema)
    .query(async ({ ctx, input }) => resolveClient(ctx).tokenize(input.text, input.model)),

  models: t.router({
    list: publicProcedure
      .output(InferenceModelSchema.array())
      .query(async ({ ctx }) => resolveClient(ctx).listModels()),

    pull: publicProcedure
      .input(ModelInputSchema)
      .subscription(({ ctx, input }) => {
        return observable<ModelPullProgress>((emit) => {
          const client = resolveClient(ctx);
          let cancelled = false;

          void (async () => {
            try {
              for await (const event of client.pullModel(input.modelId)) {
                if (cancelled) return;
                emit.next(ModelPullProgressSchema.parse(event));
              }
              emit.complete();
            } catch (error) {
              emit.error(toTrpcError(error));
            }
          })();

          return () => {
            cancelled = true;
          };
        });
      }),

    rm: publicProcedure
      .input(ModelInputSchema)
      .output(z.object({ ok: z.boolean() }))
      .mutation(async ({ ctx, input }) => resolveClient(ctx).rmModel(input.modelId)),
  }),

  backends: t.router({
    list: publicProcedure
      .output(BackendSchema.array())
      .query(async ({ ctx }) => {
        const client = resolveClient(ctx);
        if (client.listBackends !== InferenceClient.prototype.listBackends) {
          return client.listBackends();
        }
        return defaultBackends(ctx);
      }),
  }),
});

export type InferenceRouter = typeof inferenceRouter;
