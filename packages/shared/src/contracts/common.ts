import { z } from "zod";
import { FulcrumIdSchema, SchemaVersionSchema, TimestampSchema } from "../ids.js";
import { CapabilityStateSchema } from "../lifecycle.js";

export const RedactionStatusSchema = z.enum([
  "not_applicable",
  "not_redacted",
  "redacted",
  "needs_review"
]);
export const PrivacyModeSchema = z.enum(["local_first", "local_only", "operator_configured"]);

export const SourceRefSchema = z.object({
  type: z.string(),
  uri: z.string(),
  label: z.string().optional(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional()
});

export const DegradedStateSchema = z.object({
  capabilityId: FulcrumIdSchema,
  state: CapabilityStateSchema,
  cause: z.string(),
  nextAction: z.string(),
  freshness: TimestampSchema.optional()
});

export const FulcrumErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  actionable: z.boolean().default(true),
  nextAction: z.string().optional(),
  policyDecisionId: FulcrumIdSchema.optional(),
  redactionStatus: RedactionStatusSchema
});

export const SurfaceResponseSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  requestId: FulcrumIdSchema.optional(),
  status: z.enum(["ok", "error"]),
  data: z.unknown().optional(),
  error: FulcrumErrorSchema.optional(),
  degraded: z.array(DegradedStateSchema).default([]),
  policyDecisionIds: z.array(FulcrumIdSchema).default([]),
  redactionStatus: RedactionStatusSchema.default("not_applicable")
});

export type SurfaceResponse = z.infer<typeof SurfaceResponseSchema>;
