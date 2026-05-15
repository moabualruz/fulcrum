import { TRPCError } from "@trpc/server";
import type { EntityManager } from "@mikro-orm/postgresql";

import type { TRPCContext } from "../context.ts";
import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import {
  createArtifact as createApplicationArtifact,
  deleteArtifactForWeb,
  transitionArtifactLifecycle,
} from "@workflow-coordination/application/artifacts/commands.ts";
import {
  getArtifact as getApplicationArtifact,
  listArtifacts as listApplicationArtifacts,
} from "@workflow-coordination/application/artifacts/queries.ts";
import type { AppContext as ArtifactAppContext, ArtifactDto } from "@workflow-coordination/domain/artifact.ts";
import {
  ArchiveArtifactOutputSchema,
  ArtifactIdInputSchema,
  ArtifactSchema,
  type ArtifactPreviewKind,
  type ArtifactRetentionStatus,
  DeleteArtifactInputSchema,
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
  pruned?: boolean;
  retentionUntil?: Date | null;
  createdAt?: Date;
};

type ArtifactRepositoryLike = {
  list?: (input: ListArtifactsInput & { orgId: string }) => Promise<ArtifactRecord[]> | ArtifactRecord[];
  getById?: (input: { id: string }) => Promise<ArtifactRecord | null | undefined> | ArtifactRecord | null | undefined;
  create?: (input: Record<string, unknown>) => Promise<ArtifactRecord> | ArtifactRecord;
  update?: (input: { id: string; data: Partial<ArtifactRecord> }) => Promise<ArtifactRecord> | ArtifactRecord;
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

function optionalEntityManager(ctx: TRPCContext): EntityManager | null {
  return (ctx as unknown as Record<string, unknown>)["em"] as EntityManager | null ?? null;
}

function appContext(ctx: TRPCContext): ArtifactAppContext {
  if (!ctx.orgId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No org context" });
  }
  return { orgId: ctx.orgId, userId: ctx.userId, projectId: null };
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
    digest: digestOf(record),
    metadataJson: record.metadataJson ?? {},
    lifecycleState: stringOrNull(record.metadataJson?.["lifecycleState"]) ?? "created",
    archived: record.archived ?? false,
    pruned: record.pruned ?? Boolean(record.metadataJson?.["prunedAt"]),
    retentionStatus: retentionStatusOf(record),
    retentionUntil: record.retentionUntil ?? null,
    previewKind: previewKindOf(record),
    sourcePath: stringOrNull(record.metadataJson?.["sourcePath"]),
    sourceGlob: stringOrNull(record.metadataJson?.["sourceGlob"]),
    harvestedAt: stringOrNull(record.metadataJson?.["harvestedAt"]),
    producerKind: stringOrNull(record.metadataJson?.["producerKind"]),
    producerId: stringOrNull(record.metadataJson?.["producerId"]),
    edgeId: stringOrNull(record.metadataJson?.["edgeId"]),
    attestation: attestationOf(record.metadataJson?.["attestation"]),
    createdAt: record.createdAt ?? new Date(0),
  });
}

function appArtifactToRecord(artifact: ArtifactDto): ArtifactRecord {
  return {
    id: artifact.id,
    orgId: artifact.orgId,
    filename: artifact.filename,
    mime: artifact.mime,
    path: artifact.path,
    sizeBytes: 0,
    checksumSha256: null,
    metadataJson: artifact.metadataJson,
    archived: false,
    pruned: false,
    retentionUntil: null,
    createdAt: artifact.createdAt,
  };
}

function stringifyBytes(value: ArtifactRecord["sizeBytes"]): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return String(value);
  return value ?? "0";
}

function digestOf(record: ArtifactRecord): string | null {
  return stringOrNull(record.metadataJson?.["sha256"]) ?? record.checksumSha256 ?? null;
}

function retentionStatusOf(record: ArtifactRecord): ArtifactRetentionStatus {
  if (record.pruned || record.metadataJson?.["prunedAt"]) return "pruned";
  if (record.archived) return "archived";
  if (!record.retentionUntil) return "forever";
  return new Date(record.retentionUntil).getTime() < Date.now() ? "expired" : "active";
}

function previewKindOf(record: ArtifactRecord): ArtifactPreviewKind {
  const metadataKind = stringOrNull(record.metadataJson?.["previewKind"]);
  if (metadataKind === "image" || metadataKind === "text" || metadataKind === "markdown" || metadataKind === "code") {
    return metadataKind;
  }
  const mime = record.mime ?? "";
  const filename = record.filename ?? record.name ?? "";
  if (mime === "image/png") return "image";
  if (mime === "text/markdown" || filename.endsWith(".md")) return "markdown";
  if (mime.startsWith("text/")) return "text";
  if (mime === "application/json" || mime === "application/javascript" || filename.match(/\.(ts|tsx|js|jsx|css|html)$/)) {
    return "code";
  }
  return "download";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function attestationOf(value: unknown): Artifact["attestation"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    subjectDigest: stringOrNull(record["subjectDigest"]),
    predicateType: stringOrNull(record["predicateType"]),
    issuer: stringOrNull(record["issuer"]),
    signedAt: stringOrNull(record["signedAt"]),
  };
}

async function findArtifact(ctx: TRPCContext, id: string): Promise<ArtifactRecord> {
  const manager = optionalEntityManager(ctx);
  if (manager) {
    return appArtifactToRecord(await getApplicationArtifact(manager, appContext(ctx), id));
  }
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
  list: permissionedProcedure({ resource: "artifacts", action: "list" })
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
      const manager = optionalEntityManager(ctx);
      if (manager) {
        const rows = await listApplicationArtifacts(manager, appContext(ctx));
        return rows.map(appArtifactToRecord).map(toArtifact);
      }
      const rows = await deps(ctx).repository.list?.({ ...input, orgId }) ?? [];
      return rows.map(toArtifact);
    }),

  get: permissionedProcedure({ resource: "artifacts", action: "get" })
    .input(ArtifactIdInputSchema)
    .output(ArtifactSchema)
    .query(async ({ ctx, input }) => toArtifact(await findArtifact(ctx, input.id))),

  upload: permissionedProcedure({ resource: "artifacts", action: "upload" })
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
      const manager = optionalEntityManager(ctx);
      if (manager) {
        const artifact = toArtifact(appArtifactToRecord(await createApplicationArtifact(manager, appContext(ctx), {
          filename: input.filename,
          path: stored.path,
          mime: input.mime,
          metadataJson: input.metadataJson ?? {},
        })));
        await recordEvent(ctx, "artifact.uploaded", artifact, uploadPayload(input));
        return artifact;
      }
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

  download: permissionedProcedure({ resource: "artifacts", action: "download" })
    .input(ArtifactIdInputSchema)
    .output(DownloadArtifactOutputSchema)
    .query(async ({ ctx, input }) => {
      const artifact = toArtifact(await findArtifact(ctx, input.id));
      const url = await deps(ctx).storage.url?.({ path: artifact.path }) ?? artifact.path;
      return { artifact, url };
    }),

  accept: permissionedProcedure({ resource: "artifacts", action: "accept" })
    .input(ArtifactIdInputSchema)
    .output(ArtifactSchema)
    .mutation(async ({ ctx, input }) => {
      const manager = optionalEntityManager(ctx);
      const artifact = manager
        ? toArtifact(appArtifactToRecord(await transitionArtifactLifecycle(manager, appContext(ctx), {
          id: input.id,
          state: "accepted",
        })))
        : toArtifact(await deps(ctx).repository.update?.({
          id: input.id,
          data: { metadataJson: { lifecycleState: "accepted" } },
        }) ?? { ...await findArtifact(ctx, input.id), metadataJson: { lifecycleState: "accepted" } });
      await recordEvent(ctx, "artifact.accepted", artifact);
      return artifact;
    }),

  reject: permissionedProcedure({ resource: "artifacts", action: "reject" })
    .input(ArtifactIdInputSchema)
    .output(ArtifactSchema)
    .mutation(async ({ ctx, input }) => {
      const manager = optionalEntityManager(ctx);
      const artifact = manager
        ? toArtifact(appArtifactToRecord(await transitionArtifactLifecycle(manager, appContext(ctx), {
          id: input.id,
          state: "rejected",
        })))
        : toArtifact(await deps(ctx).repository.update?.({
          id: input.id,
          data: { metadataJson: { lifecycleState: "rejected" } },
        }) ?? { ...await findArtifact(ctx, input.id), metadataJson: { lifecycleState: "rejected" } });
      await recordEvent(ctx, "artifact.rejected", artifact);
      return artifact;
    }),

  archive: permissionedProcedure({ resource: "artifacts", action: "archive" })
    .input(ArtifactIdInputSchema)
    .output(ArchiveArtifactOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const record = await findArtifact(ctx, input.id);
      const updated = await deps(ctx).repository.update?.({ id: input.id, data: { archived: true } });
      const artifact = toArtifact(updated ?? { ...record, archived: true });
      await recordEvent(ctx, "artifact.archived", artifact);
      return { ok: true as const, id: input.id, archived: true };
    }),

  unarchive: permissionedProcedure({ resource: "artifacts", action: "unarchive" })
    .input(ArtifactIdInputSchema)
    .output(ArchiveArtifactOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const record = await findArtifact(ctx, input.id);
      const updated = await deps(ctx).repository.update?.({ id: input.id, data: { archived: false } });
      const artifact = toArtifact(updated ?? { ...record, archived: false });
      await recordEvent(ctx, "artifact.unarchived", artifact);
      return { ok: true as const, id: input.id, archived: false };
    }),

  delete: permissionedProcedure({ resource: "artifacts", action: "delete" })
    .input(DeleteArtifactInputSchema)
    .output(DeleteArtifactOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const artifact = toArtifact(await findArtifact(ctx, input.id));
      if (input.hard) {
        await deps(ctx).storage.delete?.(artifact.path);
        const manager = optionalEntityManager(ctx);
        if (manager) await deleteArtifactForWeb(manager, appContext(ctx), { id: input.id, hard: true, confirm: true });
        else await deps(ctx).repository.delete?.({ id: input.id });
        await recordEvent(ctx, "artifact.deleted", artifact, { hard: true });
      } else {
        const manager = optionalEntityManager(ctx);
        if (manager) await deleteArtifactForWeb(manager, appContext(ctx), { id: input.id, hard: false });
        else await deps(ctx).repository.update?.({ id: input.id, data: { archived: true } });
        await recordEvent(ctx, "artifact.deleted", artifact, { hard: false });
      }
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
