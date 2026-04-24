export interface SemanticSearchResponse {
  state: "disabled" | "degraded";
  results: [];
  capabilityId: "cap_semantic_code";
  limitation: string;
  nextAction: string;
}

export async function searchSemantic(): Promise<SemanticSearchResponse> {
  return {
    state: "disabled",
    results: [],
    capabilityId: "cap_semantic_code",
    limitation: "Semantic code search is disabled by default in local-only mode.",
    nextAction: "Use exact code search or configure an approved semantic adapter."
  };
}
