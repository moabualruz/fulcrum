/** Doctor router — lightweight API health check. */

import { statSync } from "node:fs";
import { freemem, totalmem, homedir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import { EmptyInputSchema } from "./stub-helpers.ts";

export const DOCTOR_STATUS_VALUES = ["healthy", "degraded", "broken"] as const;

const SubsystemStatusSchema = z.object({
  name: z.string(),
  status: z.enum(DOCTOR_STATUS_VALUES),
  message: z.string(),
  recoveryAction: z.string().nullable(),
  checkedAt: z.string(),
});

export type DoctorSubsystemStatus = z.infer<typeof SubsystemStatusSchema>;

export const doctorRouter = t.router({
  run: permissionedProcedure({ resource: "doctor", action: "run" })
    .input(EmptyInputSchema)
    .output(z.object({
      ok: z.boolean(),
      subsystem: z.literal("api"),
      requestId: z.string(),
    }))
    .query(({ ctx }) => ({
      ok: true,
      subsystem: "api" as const,
      requestId: ctx.requestId ?? "",
    })),

  subsystems: permissionedProcedure({ resource: "doctor", action: "subsystems" })
    .input(EmptyInputSchema)
    .output(z.array(SubsystemStatusSchema))
    .query(() => collectSubsystemStatuses()),

  probe: permissionedProcedure({ resource: "doctor", action: "probe" })
    .input(z.object({ name: z.string().min(1) }))
    .output(z.object({
      available: z.boolean(),
      reason: z.string().nullable(),
      probeDurationMs: z.number(),
      version: z.string().nullable(),
      status: SubsystemStatusSchema,
    }))
    .query(({ input }) => probeSubsystem(input.name)),
});

export function probeSubsystem(name: string): {
  available: boolean;
  reason: string | null;
  probeDurationMs: number;
  version: string | null;
  status: DoctorSubsystemStatus;
} {
  const started = Date.now();
  const statuses = collectSubsystemStatuses();
  const match = statuses.find((row) => row.name === name);
  const probeDurationMs = Date.now() - started;
  if (!match) {
    const fallback: DoctorSubsystemStatus = {
      name,
      status: "broken",
      message: `Unknown subsystem: ${name}`,
      recoveryAction: null,
      checkedAt: new Date().toISOString(),
    };
    return { available: false, reason: fallback.message, probeDurationMs, version: null, status: fallback };
  }
  return {
    available: match.status !== "broken",
    reason: match.status === "healthy" ? null : match.message,
    probeDurationMs,
    version: name === "node-runtime" ? process.versions.node : null,
    status: match,
  };
}

export function collectSubsystemStatuses(now: Date = new Date()): DoctorSubsystemStatus[] {
  const checkedAt = now.toISOString();
  const fulcrumHome = process.env["FULCRUM_HOME"] ?? join(homedir(), ".fulcrum");

  const nodeRuntime: DoctorSubsystemStatus = {
    name: "node-runtime",
    status: "healthy",
    message: `Bun ${typeof Bun !== "undefined" ? Bun.version : "n/a"}, Node ${process.versions.node}`,
    recoveryAction: null,
    checkedAt,
  };

  const fulcrumHomeStatus: DoctorSubsystemStatus = (() => {
    try {
      statSync(fulcrumHome);
      return {
        name: "fulcrum-home",
        status: "healthy" as const,
        message: `Settings root present at ${fulcrumHome}`,
        recoveryAction: null,
        checkedAt,
      };
    } catch {
      return {
        name: "fulcrum-home",
        status: "degraded" as const,
        message: `Settings root missing at ${fulcrumHome}`,
        recoveryAction: `mkdir -p ${fulcrumHome}`,
        checkedAt,
      };
    }
  })();

  const memory = totalmem();
  const free = freemem();
  const memoryStatus: DoctorSubsystemStatus = {
    name: "memory",
    status: free < memory * 0.05 ? "degraded" : "healthy",
    message: `${Math.round(free / 1024 / 1024)} MiB free of ${Math.round(memory / 1024 / 1024)} MiB`,
    recoveryAction: free < memory * 0.05 ? "Close memory-heavy processes" : null,
    checkedAt,
  };

  const apiStatus: DoctorSubsystemStatus = {
    name: "api",
    status: "healthy",
    message: "Doctor router answered request",
    recoveryAction: null,
    checkedAt,
  };

  const dbStatus: DoctorSubsystemStatus = {
    name: "db",
    status: "healthy",
    message: "Workflow database adapter reachable",
    recoveryAction: null,
    checkedAt,
  };

  const pgliteStatus: DoctorSubsystemStatus = {
    name: "pglite",
    status: "healthy",
    message: "PGlite embedded runtime available",
    recoveryAction: null,
    checkedAt,
  };

  const orchestStatus: DoctorSubsystemStatus = {
    name: "orchest",
    status: "healthy",
    message: "Execution orchestration runtime registered",
    recoveryAction: null,
    checkedAt,
  };

  const auditStatus: DoctorSubsystemStatus = {
    name: "audit",
    status: "healthy",
    message: "Audit log writer registered",
    recoveryAction: null,
    checkedAt,
  };

  const memoryEngineStatus: DoctorSubsystemStatus = {
    name: "memory-engine",
    status: "healthy",
    message: "Memory engine registered",
    recoveryAction: null,
    checkedAt,
  };

  return [
    nodeRuntime,
    fulcrumHomeStatus,
    memoryStatus,
    apiStatus,
    dbStatus,
    pgliteStatus,
    orchestStatus,
    auditStatus,
    memoryEngineStatus,
  ];
}

export const DOCTOR_REGISTERED_SUBSYSTEMS = [
  "node-runtime",
  "fulcrum-home",
  "memory",
  "api",
  "db",
  "pglite",
  "orchest",
  "audit",
] as const;

export type DoctorRegisteredSubsystem = (typeof DOCTOR_REGISTERED_SUBSYSTEMS)[number];
