export interface RebuildStep {
  name: string;
  status: "rebuilt" | "degraded";
  rebuiltCount: number;
  source: "canonical" | "unavailable";
  nextAction?: string;
}

export interface RebuildResult {
  rebuiltAt: string;
  steps: RebuildStep[];
  preservedCanonicalState: boolean;
}

const defaultSteps = [
  "indexes",
  "projections",
  "repo_maps",
  "memory_indexes",
  "code_refs",
  "context_previews"
];

export class RebuildOrchestrator {
  rebuild(availableSources: Partial<Record<string, number>> = {}): RebuildResult {
    return {
      rebuiltAt: new Date().toISOString(),
      preservedCanonicalState: true,
      steps: defaultSteps.map((name) => {
        const rebuiltCount = availableSources[name] ?? 0;
        return rebuiltCount > 0
          ? { name, status: "rebuilt", rebuiltCount, source: "canonical" }
          : {
              name,
              status: "degraded",
              rebuiltCount,
              source: "unavailable",
              nextAction: `Provide canonical source for ${name}.`
            };
      })
    };
  }
}
