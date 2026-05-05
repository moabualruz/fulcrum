import { z } from "zod";
import { InferenceError } from "./protocol.ts";

export const DEFAULT_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5";
export const DEFAULT_EMBEDDING_DIMENSION = 384;

export const EmbeddingModelMetadataSchema = z.object({
  modelId: z.string(),
  dimensions: z.number().int().positive(),
});

export type EmbeddingModelMetadata = z.infer<typeof EmbeddingModelMetadataSchema>;

/**
 * Known embedding model dimensions.
 * Default fastembed model (BAAI/bge-small-en-v1.5) outputs 384-dim vectors.
 * Non-default models fail closed unless explicitly supported.
 */
const KNOWN_EMBEDDING_DIMENSIONS: Record<string, number> = {
  [DEFAULT_EMBEDDING_MODEL]: DEFAULT_EMBEDDING_DIMENSION,
};

/**
 * Resolve model metadata by model ID.  Returns default model metadata when
 * `modelId` is omitted.  Throws `InferenceError` for unknown models so
 * callers fail closed.
 */
export function getEmbeddingModelMetadata(modelId?: string): EmbeddingModelMetadata {
  const id = modelId ?? DEFAULT_EMBEDDING_MODEL;
  const dimensions = KNOWN_EMBEDDING_DIMENSIONS[id];
  if (dimensions === undefined) {
    throw new InferenceError({
      code: -32000,
      backend: "embedded",
      message: `embedding model dimension unsupported model=${id} expectedSchema=${DEFAULT_EMBEDDING_DIMENSION} actualModel=unknown`,
    });
  }
  return { modelId: id, dimensions };
}

/**
 * Validate vector length matches expected dimension.
 * Throws `Error` (not `InferenceError`) — this is a data-level guard
 * that fires regardless of which backend produced the vector.
 */
export function assertEmbeddingDimension(
  vector: readonly number[],
  expected = DEFAULT_EMBEDDING_DIMENSION,
): void {
  if (vector.length !== expected) {
    throw new Error(
      `embedding dimension mismatch expected=${expected} actual=${vector.length}`,
    );
  }
}

/**
 * Validate that a schema-level dimension matches a model's output dimension.
 * Prevents silent truncation/padding when model or schema changes.
 */
export function assertSchemaSupportsEmbeddingDimension(
  schemaDimension: number,
  modelDimension: number,
): void {
  if (schemaDimension !== modelDimension) {
    throw new InferenceError({
      code: -32000,
      backend: "embedded",
      message: `embedding schema dimension mismatch schema=${schemaDimension} model=${modelDimension}`,
    });
  }
}
