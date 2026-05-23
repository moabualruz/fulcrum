// Doctor orchestrator — shared types and Zod schemas.
// DoctorReport is the top-level shape emitted by `fulcrum doctor --json`.

import { z } from "zod";

// ---------- check-level types ----------

export const CheckStatusSchema = z.enum(["ok", "warn", "fail"]);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const CheckSeveritySchema = z.enum(["info", "warning", "critical"]);
export type CheckSeverity = z.infer<typeof CheckSeveritySchema>;

export const DoctorCheckResultSchema = z.object({
  name: z.string(),
  subsystem: z.string(),
  status: CheckStatusSchema,
  severity: CheckSeveritySchema.optional(),
  message: z.string(),
  /** Recovery guidance shown to user on warn/fail. */
  recovery: z.string().optional(),
  /** Milliseconds the check took. */
  durationMs: z.number(),
});
export type DoctorCheckResult = z.infer<typeof DoctorCheckResultSchema>;

/** A check module exports an array of these. */
export interface DoctorCheckDef {
  name: string;
  subsystem: string;
  run: () => Promise<Omit<DoctorCheckResult, "name" | "subsystem" | "durationMs">>;
}

// ---------- report-level types ----------

export const DoctorReportSummarySchema = z.object({
  total: z.number(),
  ok: z.number(),
  warn: z.number(),
  fail: z.number(),
});
export type DoctorReportSummary = z.infer<typeof DoctorReportSummarySchema>;

export const DoctorReportSchema = z.object({
  version: z.string(),
  timestamp: z.string(),
  checks: z.array(DoctorCheckResultSchema),
  summary: DoctorReportSummarySchema,
});
export type DoctorReport = z.infer<typeof DoctorReportSchema>;
