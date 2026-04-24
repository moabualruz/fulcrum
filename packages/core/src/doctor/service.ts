import type { CapabilityHealthRecordSchema } from "@fulcrum/shared";
import type { z } from "zod";

export type CapabilityHealthRecord = z.infer<typeof CapabilityHealthRecordSchema>;

export interface DoctorReport {
  generatedAt: string;
  capabilities: CapabilityHealthRecord[];
  blockingCount: number;
  degradedCount: number;
}

export function aggregateDoctorReport(capabilities: CapabilityHealthRecord[]): DoctorReport {
  return {
    generatedAt: new Date().toISOString(),
    capabilities,
    blockingCount: capabilities.filter((capability) => capability.blocking).length,
    degradedCount: capabilities.filter((capability) => capability.state === "degraded").length
  };
}
