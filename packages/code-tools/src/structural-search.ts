import type { ExactSearchResult, PathIgnorePolicy } from "./exact-search.js";

export interface StructuralSearchOptions {
  rootPath: string;
  pattern: string;
  ignorePolicy?: PathIgnorePolicy;
  limit?: number;
}

export interface StructuralSearchResponse {
  state: "available" | "degraded";
  results: ExactSearchResult[];
  limitation?: string;
}

export async function searchStructural(
  _options: StructuralSearchOptions
): Promise<StructuralSearchResponse> {
  return {
    state: "degraded",
    results: [],
    limitation: "No local structural-search adapter is configured."
  };
}
