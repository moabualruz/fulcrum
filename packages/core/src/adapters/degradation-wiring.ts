import type { CapabilityHealthRecord } from "@fulcrum/shared";
import type { AdapterRegistryService } from "./registry.js";

export interface DegradedCapabilitySummary {
  generatedAt: string;
  capabilities: CapabilityHealthRecord[];
  degraded: CapabilityHealthRecord[];
  disabled: CapabilityHealthRecord[];
  blocked: CapabilityHealthRecord[];
  lanes: {
    doctor: CapabilityHealthRecord[];
    context: CapabilityHealthRecord[];
    memory: CapabilityHealthRecord[];
    code: CapabilityHealthRecord[];
    run: CapabilityHealthRecord[];
    policy: CapabilityHealthRecord[];
  };
}

export async function buildAdapterDegradationSummary(
  registry: AdapterRegistryService
): Promise<DegradedCapabilitySummary> {
  const entries = await registry.listHealth();
  const capabilities = entries.map((entry) => entry.health);
  const byWorkflow = (workflow: keyof DegradedCapabilitySummary["lanes"]) =>
    capabilities.filter((capability) => capability.affectedWorkflows.includes(workflow));
  return {
    generatedAt: new Date().toISOString(),
    capabilities,
    degraded: capabilities.filter((capability) => capability.state === "degraded"),
    disabled: capabilities.filter((capability) => capability.state === "disabled"),
    blocked: capabilities.filter((capability) => capability.blocking),
    lanes: {
      doctor: byWorkflow("doctor"),
      context: byWorkflow("context"),
      memory: byWorkflow("memory"),
      code: byWorkflow("code"),
      run: byWorkflow("run"),
      policy: byWorkflow("policy")
    }
  };
}
