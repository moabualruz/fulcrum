import type { CapabilityHealthRecord } from "@fulcrum/shared";
import type { ExternalPmAdapterPort } from "../external-pm/service.js";

export async function externalPmHealth(
  adapter?: Pick<ExternalPmAdapterPort, "metadata"> & {
    healthCheck?: () => Promise<CapabilityHealthRecord>;
  }
): Promise<CapabilityHealthRecord> {
  if (adapter?.healthCheck) {
    return adapter.healthCheck();
  }
  return {
    capabilityId: "cap_external_pm",
    state: "disabled",
    blocking: false,
    cause: "No external project management adapter configured.",
    nextAction: "Configure Plane only if external PM mirroring is required.",
    privacyStatus: "local_only",
    affectedWorkflows: ["external_pm_import", "external_writeback"],
    freshness: new Date().toISOString()
  };
}
