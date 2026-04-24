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
export * from "./artifacts/storage.js";
export * from "./artifacts/service.js";
export * from "./privacy/ignored-paths.js";
export * from "./policy/previews.js";
export * from "./doctor/service.js";
export * from "./doctor/setup-doctor.js";
export * from "./adapters/adapter.js";
export * from "./container.js";
export * from "./setup/paths.js";
export * from "./setup/preview.js";
export * from "./setup/apply.js";
export * from "./projects/service.js";
export * from "./tasks/service.js";
export * from "./queues/projections.js";
export * from "./work/file-repository.js";
export * from "./external-pm/service.js";
export * from "./doctor/pm-health.js";
export * from "./code/evidence-service.js";
