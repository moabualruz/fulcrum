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
});

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

  return [nodeRuntime, fulcrumHomeStatus, memoryStatus, apiStatus];
}
