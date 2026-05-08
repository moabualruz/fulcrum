import { z } from "zod";

import { traceRefSchema } from "../trace/schemas.ts";

export const auditActorSchema = z.object({
  kind: z.enum(["user", "agent", "automation", "system"]),
  id: z.string().min(1),
});

export const auditEventInputSchema = z.object({
  actor: auditActorSchema,
  verb: z.string().min(1),
  source: traceRefSchema,
  target: traceRefSchema,
  causationId: z.string().min(1),
  correlationId: z.string().min(1).optional(),
  before: z.record(z.string(), z.unknown()).optional(),
  after: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.string().datetime().optional(),
});

export const auditEventEnvelopeSchema = auditEventInputSchema.extend({
  correlationId: z.string().min(1),
  occurredAt: z.string().datetime(),
});

export type AuditEventInput = z.infer<typeof auditEventInputSchema>;
export type AuditEventEnvelope = z.infer<typeof auditEventEnvelopeSchema>;

export function createAuditEventEnvelope(input: AuditEventInput): AuditEventEnvelope {
  const parsed = auditEventInputSchema.parse(input);
  return auditEventEnvelopeSchema.parse({
    ...parsed,
    correlationId: parsed.correlationId ?? crypto.randomUUID(),
    occurredAt: parsed.occurredAt ?? new Date().toISOString(),
  });
}
