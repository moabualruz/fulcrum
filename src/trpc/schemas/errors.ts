/**
 * Shared error shape schemas — used by all tRPC middleware and REST handlers.
 * P13#03: TRPCErrorShape and RESTErrorShape are the canonical error contracts.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Inner error body shared by both tRPC and REST error shapes. */
export const ErrorBodySchema = z.object({
  code: z.string().describe("Machine-readable error code, e.g. NOT_FOUND or UNAUTHORIZED."),
  message: z.string().describe("Human-readable description of what went wrong."),
  requestId: z.string().describe("Unique identifier for the request, used for log correlation."),
});

/**
 * tRPC error shape — flat object returned in the `error.data` envelope.
 * Shape: `{ code, message, requestId }`.
 */
export const TRPCErrorShape = z.object({
  code: z.string().describe("tRPC error code string, e.g. INTERNAL_SERVER_ERROR."),
  message: z.string().describe("Human-readable description of what went wrong."),
  requestId: z.string().describe("Unique identifier for the request, used for log correlation."),
});

/**
 * REST error shape — wraps the error body in an `error` key.
 * Shape: `{ error: { code, message, requestId } }`.
 */
export const RESTErrorShape = z.object({
  error: ErrorBodySchema.describe("Error details returned from REST endpoints."),
});

export type TRPCError = z.infer<typeof TRPCErrorShape>;
export type RESTError = z.infer<typeof RESTErrorShape>;
export type ErrorBody = z.infer<typeof ErrorBodySchema>;
