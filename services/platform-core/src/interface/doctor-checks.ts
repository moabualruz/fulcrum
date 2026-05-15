import type { DoctorCheckDef, DoctorReport } from "./doctor-results.ts";

export async function discoverChecks(): Promise<DoctorCheckDef[]> {
  const doctor = await import("@platform-core/application/health-checks/index.ts");
  return doctor.discoverChecks();
}

export async function buildDoctorReport(): Promise<DoctorReport> {
  const doctor = await import("@platform-core/application/health-checks/index.ts");
  return doctor.buildDoctorReport();
}
