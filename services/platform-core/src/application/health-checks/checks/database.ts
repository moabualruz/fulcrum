import { buildProductKernelDoctorReport } from "@platform-core/infrastructure/doctor/product-store-report.ts";
import type { DoctorCheckDef } from "../types.ts";

export const checks: DoctorCheckDef[] = [
  {
    name: "product-database",
    subsystem: "database",
    run: async () => {
      const report = await buildProductKernelDoctorReport();
      if (report.error) {
        return {
          status: "fail",
          message: `${report.engine} database unavailable at ${report.dbPath}: ${report.error}`,
          recovery: "Check FULCRUM_HOME, FULCRUM_DATABASE_URL, DATABASE_URL, and database reachability.",
        };
      }
      if (report.engine === "absent") {
        return {
          status: "warn",
          message: `local PGlite database not initialised at ${report.dbPath}`,
          recovery: "Run product initialization or db migration before serving workflows.",
        };
      }
      return {
        status: "ok",
        message: `${report.engine} database selected at ${report.dbPath}; migrations=${report.schemaApplied}`,
      };
    },
  },
];
