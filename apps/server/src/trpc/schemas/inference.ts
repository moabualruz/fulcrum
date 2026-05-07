/**
 * Zod schemas for the inference domain (model calls, completions, embeddings).
 * Pillar 8 (inference abstraction) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Inference provider — which model backend to target. */
export const InferenceProviderSchema = z.enum([
  "anthropic",
  "openai",
  "gemini",
  "local",
  "custom",
]);

/** Inference mode — type of inference operation. */
export const InferenceModeSchema = z.enum(["completion", "embedding", "rerank", "classify"]);

/** Input for submitting an inference request. */
export const InferenceInput = z.object({
  orgId: z.string().uuid().describe("Organisation making the inference request."),
  provider: InferenceProviderSchema.describe("Model provider to route the request to."),
  mode: InferenceModeSchema.describe("Type of inference operation to perform."),
  model: z.string().describe("Model identifier, e.g. claude-sonnet-4-6 or gpt-4o."),
  prompt: z.string().describe("Input text or prompt to send to the model."),
  maxTokens: z.number().int().positive().optional().describe("Maximum tokens to generate in the response."),
  temperature: z.number().min(0).max(2).optional().describe("Sampling temperature; higher = more random."),
});

/** Minimal Inference output schema. */
export const InferenceOutput = z.object({
  id: z.string().uuid().describe("Unique inference record identifier."),
  orgId: z.string().uuid().describe("Organisation that made the inference request."),
  provider: InferenceProviderSchema.describe("Model provider that handled the request."),
  mode: InferenceModeSchema.describe("Type of inference operation performed."),
  model: z.string().describe("Model identifier used for the inference."),
  result: z.string().describe("Raw text output from the model."),
  inputTokens: z.number().int().describe("Number of tokens in the input prompt."),
  outputTokens: z.number().int().describe("Number of tokens in the generated output."),
  createdAt: z.date().describe("Timestamp when the inference was completed."),
});

/** Input for listing inference records. */
export const ListInferenceInput = z.object({
  orgId: z.string().uuid().optional().describe("Filter by organisation."),
  provider: InferenceProviderSchema.optional().describe("Filter by provider."),
  mode: InferenceModeSchema.optional().describe("Filter by inference mode."),
});

export type InferenceInputType = z.infer<typeof InferenceInput>;
export type InferenceOutputType = z.infer<typeof InferenceOutput>;
export type InferenceProvider = z.infer<typeof InferenceProviderSchema>;
export type InferenceMode = z.infer<typeof InferenceModeSchema>;
export type ListInferenceInputType = z.infer<typeof ListInferenceInput>;
