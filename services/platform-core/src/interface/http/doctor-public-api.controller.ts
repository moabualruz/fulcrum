import "reflect-metadata";

import { Controller, Get, Inject, Module } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { buildDoctorReport, discoverChecks } from "@platform-core/application/health-checks/index.ts";

export class DoctorPublicApiService {
  async run() {
    return await buildDoctorReport();
  }

  async subsystems() {
    const checks = await discoverChecks();
    return [...new Set(checks.map((check) => check.subsystem))].sort();
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
