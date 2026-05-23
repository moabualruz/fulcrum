import "reflect-metadata";

import { Controller, Get, Inject, Module } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { buildDoctorReport, discoverChecks } from "@platform-core/application/health-checks/index.ts";
import {
  runPlatformDoctorChecks,
  type PlatformDoctorStatus,
} from "@platform-core/application/platform-operations/readiness-checks.ts";

type DoctorSeverity = "info" | "warning" | "critical";

function severityForPlatformStatus(status: PlatformDoctorStatus): DoctorSeverity {
  if (status === "fail") return "critical";
  if (status === "warn") return "warning";
  return "info";
}

export interface DoctorPublicApiOptions {
  buildReport?: typeof buildDoctorReport;
  discover?: typeof discoverChecks;
  platformChecks?: typeof runPlatformDoctorChecks;
}

export class DoctorPublicApiService {
  constructor(private readonly options: DoctorPublicApiOptions = {}) {}

  async run() {
    const [report, platformChecks] = await Promise.all([
      (this.options.buildReport ?? buildDoctorReport)(),
      (this.options.platformChecks ?? runPlatformDoctorChecks)(),
    ]);

    return {
      ...report,
      platformChecks: platformChecks.map((check) => ({
        ...check,
        severity: severityForPlatformStatus(check.status),
      })),
    };
  }

  async subsystems() {
    const checks = await (this.options.discover ?? discoverChecks)();
    return [...new Set([
      ...checks.map((check) => check.subsystem),
      "platform",
    ])].sort();
  }
}

export class DoctorPublicApiController {
  constructor(private readonly doctor: DoctorPublicApiService) {}

  async run() {
    return await this.doctor.run();
  }

  async subsystems() {
    return await this.doctor.subsystems();
  }
}

export class DoctorPublicApiModule {}

Inject(DoctorPublicApiService)(DoctorPublicApiController, undefined, 0);

const runDescriptor = Object.getOwnPropertyDescriptor(DoctorPublicApiController.prototype, "run");
const subsystemsDescriptor = Object.getOwnPropertyDescriptor(DoctorPublicApiController.prototype, "subsystems");

if (!runDescriptor || !subsystemsDescriptor) {
  throw new Error("DoctorPublicApiController route descriptors are missing");
}

Controller("api/v1/doctor")(DoctorPublicApiController);
ApiTags("doctor")(DoctorPublicApiController);

Get()(DoctorPublicApiController.prototype, "run", runDescriptor);
ApiOperation({ summary: "Run doctor checks" })(DoctorPublicApiController.prototype, "run", runDescriptor);
ApiOkResponse({ description: "Doctor report" })(DoctorPublicApiController.prototype, "run", runDescriptor);

Get("subsystems")(DoctorPublicApiController.prototype, "subsystems", subsystemsDescriptor);
ApiOperation({ summary: "List doctor subsystems" })(
  DoctorPublicApiController.prototype,
  "subsystems",
  subsystemsDescriptor,
);
ApiOkResponse({ description: "Doctor subsystems" })(
  DoctorPublicApiController.prototype,
  "subsystems",
  subsystemsDescriptor,
);

Module({
  controllers: [DoctorPublicApiController],
  providers: [DoctorPublicApiService],
  exports: [DoctorPublicApiService],
})(DoctorPublicApiModule);
