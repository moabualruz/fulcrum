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
export * from "./doctor/copilot.js";
export * from "./adapters/adapter.js";
export * from "./adapters/registry.js";
export * from "./adapters/health-modules.js";
export * from "./adapters/degradation-wiring.js";
export * from "./adapters/file-repository.js";
export * from "./observability/adapters.js";
export * from "./container.js";
export * from "./setup/paths.js";
export * from "./setup/preview.js";
export * from "./setup/apply.js";
export * from "./projects/service.js";
export * from "./tasks/service.js";
export * from "./queues/projections.js";
export * from "./runs/service.js";
export * from "./runs/log-capture.js";
export * from "./runs/quality-links.js";
export * from "./worktrees/allocation.js";
export * from "./worktrees/status.js";
export * from "./work/file-repository.js";
export * from "./external-pm/service.js";
export * from "./policy/enforcement.js";
export * from "./doctor/pm-health.js";
export * from "./memory/service.js";
export * from "./memory/export.js";
export * from "./code/evidence-service.js";
export * from "./context/builder.js";
export * from "./context/ranking.js";
export * from "./context/export.js";
export * from "./quality/runner.js";
export * from "./quality/readiness.js";
export * from "./readiness/adapter-certification.js";
export * from "./graph/service.js";
export * from "./graph/queries.js";
export * from "./graph/link-writers.js";
export * from "./recovery/backup.js";
export * from "./recovery/restore.js";
export * from "./recovery/export.js";
export * from "./recovery/rebuild.js";
export * from "./recovery/reset-uninstall.js";
