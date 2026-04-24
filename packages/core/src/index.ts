export interface CapabilityHealth {
  capabilityId: string;
  state: "managed" | "detected" | "guided" | "blocked" | "degraded" | "disabled" | "unknown";
  nextAction?: string;
}

export function doctorScaffold(): CapabilityHealth[] {
  return [
    {
      capabilityId: "cap_local_state",
      state: "guided",
      nextAction: "Run fulcrum setup preview, then fulcrum setup apply."
    }
  ];
}

export * from "./events/jsonl-writer.js";
