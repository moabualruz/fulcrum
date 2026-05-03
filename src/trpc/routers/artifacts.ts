import { TRPCError } from "@trpc/server";

import type { TRPCContext } from "../context.ts";
import { t } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";
import {
  ArtifactIdInputSchema,
  ArtifactSchema,
  DeleteArtifactOutputSchema,
  DownloadArtifactOutputSchema,
  ListArtifactsInputSchema,
  UploadArtifactInputSchema,
  type Artifact,
  type ListArtifactsInput,
  type UploadArtifactInput,
} from "../schemas/artifacts.ts";

type ArtifactRecord = {
  id: string;
  orgId?: string;
  org?: { id: string } | string;
  projectId?: string | null;
  runId?: string | null;
  run?: { id: string } | string | null;
  taskId?: string | null;
  task?: { id: string } | string | null;
  filename?: string;
  name?: string;
  mime?: string | null;
  sizeBytes?: bigint | number | string | null;
  path?: string;
  checksumSha256?: string | null;
  metadataJson?: Record<string, unknown> | null;
  archived?: boolean;
  retentionUntil?: Date | null;
  createdAt?: Date;
};

type ArtifactRepositoryLike = {
  list?: (input: ListArtifactsInput & { orgId: string }) => Promise<ArtifactRecord[]> | ArtifactRecord[];
  getById?: (input: { id: string }) => Promise<ArtifactRecord | null | undefined> | ArtifactRecord | null | undefined;
  create?: (input: Record<string, unknown>) => Promise<ArtifactRecord> | ArtifactRecord;
  delete?: (input: { id: string }) => Promise<unknown> | unknown;
};

type ArtifactStorageLike = {
  reserve?: (input: {
    orgId: string;
    filename: string;
    projectId?: string;
    runId?: string;
  }) => Promise<{ path: string }> | { path: string };
  url?: (input: { path: string }) => Promise<string> | string;
  delete?: (path: string) => Promise<unknown> | unknown;
};

type ArtifactEventsLike = {
  record?: (event: {
    orgId: string;
    userId: string;
    verb: string;
    subjectKind: "artifact";
    subjectId: string;
    payload?: Record<string, unknown>;
  }) => Promise<unknown> | unknown;
};

type ArtifactDepsContext = TRPCContext & {
  artifacts?: {
    repository?: ArtifactRepositoryLike;
    storage?: ArtifactStorageLike;
    events?: ArtifactEventsLike;
  };
};

function deps(ctx: TRPCContext) {
  const artifactCtx = (ctx as ArtifactDepsContext).artifacts;
  return {
    repository: artifactCtx?.repository ?? {},
    storage: artifactCtx?.storage ?? {},
    events: artifactCtx?.events ?? {},
  };
}

function orgIdOf(record: ArtifactRecord): string | null {
  if (record.orgId) return record.orgId;
  if (typeof record.org === "string") return record.org;
  return record.org?.id ?? null;
}

function idOf(value: ArtifactRecord["run"]): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id;
}

function toArtifact(record: ArtifactRecord): Artifact {
  const orgId = orgIdOf(record);
  if (!orgId) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Artifact row is missing org id.",
    });
  }

  return ArtifactSchema.parse({
    id: record.id,
    orgId,
    projectId: record.projectId ?? null,
    runId: record.runId ?? idOf(record.run),
    taskId: record.taskId ?? idOf(record.task),
    filename: record.filename ?? record.name ?? record.id,
    mime: record.mime ?? null,
    sizeBytes: stringifyBytes(record.sizeBytes),
    path: record.path ?? record.id,
    checksumSha256: record.checksumSha256 ?? null,
    metadataJson: record.metadataJson ?? {},
    archived: record.archived ?? false,
    retentionUntil: record.retentionUntil ?? null,
    createdAt: record.createdAt ?? new Date(0),
  });
}

function stringifyBytes(value: ArtifactRecord["sizeBytes"]): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return String(value);
  return value ?? "0";
}

async function findArtifact(ctx: TRPCContext, id: string): Promise<ArtifactRecord> {
  const record = await deps(ctx).repository.getById?.({ id });
  if (!record) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Artifact not found: ${id}`,
    });
  }
  if (orgIdOf(record) !== ctx.orgId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Artifact belongs to a different org.",
    });
  }
  return record;
}

async function recordEvent(
  ctx: TRPCContext,
  verb: string,
  artifact: Artifact,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await deps(ctx).events.record?.({
    orgId: ctx.orgId!,
    userId: ctx.userId!,
    verb,
    subjectKind: "artifact",
    subjectId: artifact.id,
    payload,
  });
}

export const artifactsRouter = t.router({
  list: protectedProcedure
    .input(ListArtifactsInputSchema)
    .output(ArtifactSchema.array())
    .query(async ({ ctx, input }) => {
      const orgId = input.orgId ?? ctx.orgId;
      if (orgId !== ctx.orgId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot list artifacts for a different org.",
        });
      }
      const rows = await deps(ctx).repository.list?.({ ...input, orgId }) ?? [];
      return rows.map(toArtifact);
    }),

  get: protectedProcedure
    .input(ArtifactIdInputSchema)
    .output(ArtifactSchema)
    .query(async ({ ctx, input }) => toArtifact(await findArtifact(ctx, input.id))),

  upload: protectedProcedure
    .input(UploadArtifactInputSchema)
    .output(ArtifactSchema)
    .mutation(async ({ ctx, input }) => {
      const storage = deps(ctx).storage;
      const stored = await storage.reserve?.({
        orgId: ctx.orgId,
        filename: input.filename,
        projectId: input.projectId,
        runId: input.runId,
      }) ?? { path: input.filename };
      const record = await deps(ctx).repository.create?.({
        orgId: ctx.orgId,
        userId: ctx.userId,
        ...input,
        sizeBytes: BigInt(input.sizeBytes),
        path: stored.path,
        metadataJson: input.metadataJson ?? {},
      });
      if (!record) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Artifact repository did not return created row.",
        });
      }
      const artifact = toArtifact(record);
      await recordEvent(ctx, "artifact.uploaded", artifact, uploadPayload(input));
      return artifact;
    }),

  download: protectedProcedure
    .input(ArtifactIdInputSchema)
    .output(DownloadArtifactOutputSchema)
    .query(async ({ ctx, input }) => {
      const artifact = toArtifact(await findArtifact(ctx, input.id));
      const url = await deps(ctx).storage.url?.({ path: artifact.path }) ?? artifact.path;
      return { artifact, url };
    }),

  delete: protectedProcedure
    .input(ArtifactIdInputSchema)
    .output(DeleteArtifactOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const artifact = toArtifact(await findArtifact(ctx, input.id));
      await deps(ctx).storage.delete?.(artifact.path);
      await deps(ctx).repository.delete?.({ id: input.id });
      await recordEvent(ctx, "artifact.deleted", artifact);
      return { ok: true, id: input.id };
    }),
});

export type ArtifactsRouter = typeof artifactsRouter;

function uploadPayload(input: UploadArtifactInput): Record<string, unknown> {
  return {
    filename: input.filename,
    mime: input.mime,
    sizeBytes: input.sizeBytes,
    projectId: input.projectId ?? null,
    runId: input.runId ?? null,
    taskId: input.taskId ?? null,
    docId: input.docId ?? null,
  };
}
