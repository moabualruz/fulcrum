// @ts-nocheck -- zod schema effect typing stays broad around runtime validation helpers.
/**
 * Platform audit-event emitter.
 *
 * Provides:
 *   - Zod schemas for every platform event payload type (validated on emit).
 *   - `emitPlatformEvent()` — low-level emitter backed by MikroORM Event entity
 *     or an injectable EventSink for testing.
 *   - `measureP99()` — utility: run fn N times, return p99 latency in ms.
 *
 * Security: no plaintext secret values may appear in any payload schema.
 * Every schema explicitly omits / strips secret fields.
 *
 * subject_kind ∈ {credential, backup, telemetry_event, feature_flag,
 *                 experiment, error_log}
 * verb ∈ {created, updated, deleted, rotated, archived, opted_in, opted_out,
 *         purged, enabled, disabled, exported, imported}
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Allowed enums
// ─────────────────────────────────────────────────────────────────────────────

export const SUBJECT_KINDS = [
  "user_setting",
  "theme",
  "credential",
  "backup",
  "telemetry_event",
  "feature_flag",
  "experiment",
  "error_log",
  "migration",
  "system",
] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export const VERBS = [
  "created",
  "updated",
  "deleted",
  "rotated",
  "archived",
  "opted_in",
  "opted_out",
  "purged",
  "enabled",
  "disabled",
  "exported",
  "imported",
  "restored",
  "downgraded",
  "shutdown.completed",
] as const;
export type Verb = (typeof VERBS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Per-event-type payload schemas: no plaintext secret values.
// ─────────────────────────────────────────────────────────────────────────────

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "value",
  "secret",
  "token",
  "password",
  "apiKey",
  "api_key",
  "encrypted_value",
]);

function rejectForbiddenPayloadKeys(payload: unknown, ctx: z.RefinementCtx, path: Array<string | number> = []): void {
  if (!payload || typeof payload !== "object") return;
  if (Array.isArray(payload)) {
    payload.forEach((item, index) => rejectForbiddenPayloadKeys(item, ctx, [...path, index]));
    return;
  }

  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const nextPath = [...path, key];
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: nextPath,
        message: `audit payload must not contain secret-like key '${key}'`,
      });
    }
    rejectForbiddenPayloadKeys(value, ctx, nextPath);
  }
}

function auditPayloadSchema<T extends z.ZodRawShape>(shape: T): z.ZodEffects<z.ZodObject<T, "strict">> {
  return z.object(shape).strict().superRefine((payload, ctx) => {
    rejectForbiddenPayloadKeys(payload, ctx);
  });
}

/** user_setting.updated */
export const UserSettingUpdatedPayloadSchema = auditPayloadSchema({
  key: z.string(),
  projectId: z.string().optional(),
});

/** theme.updated */
export const ThemeUpdatedPayloadSchema = auditPayloadSchema({
  key: z.string(),
  oldTheme: z.string().optional(),
  newTheme: z.string().optional(),
});

/** credential.set / credential.created */
export const CredentialSetPayloadSchema = auditPayloadSchema({
  name: z.string(),
  algo: z.string().optional(),
  kdf: z.string().optional(),
  provider: z.string().optional(),
  // "value" is intentionally absent — no plaintext secrets
});

/** credential.rotate */
export const CredentialRotatePayloadSchema = auditPayloadSchema({
  name: z.string(),
  rotatedAt: z.string(), // ISO-8601
});

/** credential.archive */
export const CredentialArchivePayloadSchema = auditPayloadSchema({
  name: z.string(),
});

/** credential.deleted */
export const CredentialDeletePayloadSchema = auditPayloadSchema({
  name: z.string(),
});

/** backup.create */
export const BackupCreatePayloadSchema = auditPayloadSchema({
  format: z.string().optional(),
  entityCounts: z.record(z.string(), z.number()).optional(),
  durationMs: z.number().optional(),
});

/** telemetry_event.opted_in / opted_out */
export const TelemetryOptPayloadSchema = auditPayloadSchema({
  optedIn: z.boolean(),
});

/** telemetry_event.purged */
export const TelemetryPurgePayloadSchema = auditPayloadSchema({
  deleted: z.number().int().nonnegative(),
});

/** feature_flag.enabled / feature_flag.disabled */
export const FlagSetPayloadSchema = auditPayloadSchema({
  flag: z.string(),
  enabled: z.boolean(),
  orgId: z.string().optional(),
  userId: z.string().optional(),
});

/** experiment.created */
export const ExperimentCreatePayloadSchema = auditPayloadSchema({
  experimentId: z.string(),
  name: z.string().optional(),
});

/** error_log.created */
export const ErrorLogCreatePayloadSchema = auditPayloadSchema({
  kind: z.string().optional(),
  message: z.string().optional(),
});

/** dataExport.create */
export const DataExportCreatePayloadSchema = auditPayloadSchema({
  format: z.string().optional(),
  entityCounts: z.record(z.string(), z.number()).optional(),
  durationMs: z.number().optional(),
});

/** dataImport.run */
export const DataImportRunPayloadSchema = auditPayloadSchema({
  importId: z.string().optional(),
  entityCounts: z.record(z.string(), z.number()).optional(),
  durationMs: z.number().optional(),
});

/** migration.downgraded */
export const MigrationDowngradedPayloadSchema = auditPayloadSchema({
  migration: z.string(),
});

/** system.shutdown.completed */
export const SystemShutdownCompletedPayloadSchema = auditPayloadSchema({
  signal: z.string(),
  completed: z.array(z.string()),
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema registry
// ─────────────────────────────────────────────────────────────────────────────

/** Maps `${subjectKind}.${verb}` → Zod schema for that payload. */
const PAYLOAD_SCHEMA_REGISTRY = new Map<string, z.ZodTypeAny>([
  ["user_setting.updated", UserSettingUpdatedPayloadSchema],
  ["theme.updated", ThemeUpdatedPayloadSchema],
  ["credential.created", CredentialSetPayloadSchema],
  ["credential.updated", CredentialSetPayloadSchema],
  ["credential.rotated", CredentialRotatePayloadSchema],
  ["credential.archived", CredentialArchivePayloadSchema],
  ["credential.deleted", CredentialDeletePayloadSchema],
  ["backup.created", BackupCreatePayloadSchema],
  ["backup.restored", BackupCreatePayloadSchema],
  ["telemetry_event.opted_in", TelemetryOptPayloadSchema],
  ["telemetry_event.opted_out", TelemetryOptPayloadSchema],
  ["telemetry_event.purged", TelemetryPurgePayloadSchema],
  ["feature_flag.enabled", FlagSetPayloadSchema],
  ["feature_flag.disabled", FlagSetPayloadSchema],
  ["experiment.created", ExperimentCreatePayloadSchema],
  ["error_log.created", ErrorLogCreatePayloadSchema],
  ["backup.exported", DataExportCreatePayloadSchema],
  ["backup.imported", DataImportRunPayloadSchema],
  ["migration.downgraded", MigrationDowngradedPayloadSchema],
  ["system.shutdown.completed", SystemShutdownCompletedPayloadSchema],
]);

export function getPayloadSchema(
  subjectKind: string,
  verb: string,
): z.ZodTypeAny | undefined {
  return PAYLOAD_SCHEMA_REGISTRY.get(`${subjectKind}.${verb}`);
}

export function isPayloadSchemaRegistered(subjectKind: string, verb: string): boolean {
  return PAYLOAD_SCHEMA_REGISTRY.has(`${subjectKind}.${verb}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// EventSink interface — decouples emitter from MikroORM for testing
// ─────────────────────────────────────────────────────────────────────────────

export interface PlatformEventInput {
  orgId: string;
  userId?: string | null;
  subjectKind: SubjectKind;
  subjectId: string;
  verb: Verb;
  payload?: Record<string, unknown>;
}

export interface EmittedEvent {
  orgId: string;
  userId?: string | null;
  subjectKind: string;
  subjectId: string;
  verb: string;
  payload: Record<string, unknown>;
  emittedAt: string;
}

export interface EventSink {
  emit(event: EmittedEvent): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core emitter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emit a platform audit event.
 *
 * Steps:
 *   1. Validate payload against registered Zod schema (throws if invalid or unregistered).
 *   2. Forward to `sink.emit()`.
 *
 * Instrumentation: caller should wrap with `measureSpan()` if desired.
 */
export async function emitPlatformEvent(
  sink: EventSink,
  input: PlatformEventInput,
): Promise<void> {
  const key = `${input.subjectKind}.${input.verb}`;
  const schema = PAYLOAD_SCHEMA_REGISTRY.get(key);

  if (!schema) {
    throw new Error(
      `[platform/audit-events] No payload schema registered for "${key}". ` +
      `Register one in PAYLOAD_SCHEMA_REGISTRY before emitting.`,
    );
  }

  // Validate (throws ZodError if invalid)
  const validatedPayload = schema.parse(input.payload ?? {});

  await sink.emit({
    orgId: input.orgId,
    userId: input.userId ?? null,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    verb: input.verb,
    payload: validatedPayload as Record<string, unknown>,
    emittedAt: new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MikroORM-backed EventSink (production path)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an EventSink backed by MikroORM EntityManager.
 * Import lazily so web-bundle SSR never statically loads entity decorators.
 */
export async function mkOrmEventSink(
  em: import("@mikro-orm/postgresql").EntityManager,
  orgRef: import("@platform-core/infrastructure/application-database/entities/auth/Org.ts").Org,
): Promise<EventSink> {
  return {
    async emit(event: EmittedEvent): Promise<void> {
      const { Event: EventEntity } = await import("@platform-core/infrastructure/application-database/entities/core/Event.ts");
      const entity = em.create(EventEntity, {
        org: orgRef,
        verb: `${event.subjectKind}.${event.verb}`,
        subjectKind: event.subjectKind,
        subjectId: event.subjectId,
        payload: event.payload,
      });
      em.persist(entity);
      await em.flush();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run `fn` `iterations` times, collect durations (Bun.performance.now()),
 * and return the p99 latency in milliseconds.
 */
export async function measureP99(
  fn: () => Promise<void> | void,
  iterations: number,
): Promise<number> {
  const durations: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn();
    durations.push(performance.now() - t0);
  }
  durations.sort((a, b) => a - b);
  const idx = Math.ceil(iterations * 0.99) - 1;
  return durations[Math.max(0, idx)] as number;
}

/**
 * Measure a single span duration (Bun.performance.now()).
 * Returns { result, durationMs }.
 */
export async function measureSpan<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const t0 = performance.now();
  const result = await fn();
  return { result, durationMs: performance.now() - t0 };
}
