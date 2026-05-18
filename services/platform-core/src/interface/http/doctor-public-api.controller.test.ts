import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  DoctorPublicApiController,
  DoctorPublicApiModule,
  DoctorPublicApiService,
} from "@platform-core/interface/http/doctor-public-api.controller.ts";

describe("doctor public Nest API", () => {
  test("is mounted as a Nest controller on the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, DoctorPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(DoctorPublicApiController);
    expect(appImports).toContain(DoctorPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, DoctorPublicApiController)).toBe("api/v1/doctor");
    expect(Reflect.getMetadata(METHOD_METADATA, DoctorPublicApiController.prototype.run)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, DoctorPublicApiController.prototype.subsystems)).toBe("subsystems");
    expect(Reflect.getMetadata(METHOD_METADATA, DoctorPublicApiController.prototype.subsystems)).toBe(
      RequestMethod.GET,
    );
  });

  test("serves the shared health-check report and subsystem list", async () => {
    const controller = new DoctorPublicApiController(new DoctorPublicApiService());
    const report = await controller.run() as {
      version?: string;
      checks?: unknown[];
      summary?: { total?: number };
    };
    const subsystems = await controller.subsystems() as string[];

    expect(report.version).toBe("1.0.0");
    expect(Array.isArray(report.checks)).toBe(true);
    expect(report.summary?.total).toBe(report.checks?.length);
    expect(report.checks).toContainEqual(expect.objectContaining({
      name: "product-database",
      subsystem: "database",
    }));
    expect(subsystems).toContain("cli");
    expect(subsystems).toContain("database");
    expect([...subsystems].sort()).toEqual(subsystems);
  });
});
