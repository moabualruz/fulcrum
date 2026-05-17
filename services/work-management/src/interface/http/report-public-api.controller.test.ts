import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";

import { InternalServerErrorException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  ReportBurndownQueryDto,
  ReportPublicApiController,
  ReportPublicApiModule,
  ReportPublicApiService,
  ReportVelocityQueryDto,
} from "@work-management/interface/http/report-public-api.controller.ts";

describe("report public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ReportPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(ReportPublicApiController);
    expect(appImports).toContain(ReportPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, ReportPublicApiController)).toBe("api/v1/reports");
    expect(Reflect.getMetadata(PATH_METADATA, ReportPublicApiController.prototype.burndown)).toBe("burndown");
    expect(Reflect.getMetadata(METHOD_METADATA, ReportPublicApiController.prototype.burndown)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, ReportPublicApiController.prototype.velocity)).toBe("velocity");
    expect(Reflect.getMetadata(METHOD_METADATA, ReportPublicApiController.prototype.velocity)).toBe(
      RequestMethod.GET,
    );
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new ReportPublicApiController(new ReportPublicApiService());

      await expect(controller.burndown({ orgId: "org-1", project_id: "project-1" })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("fails closed when the public API feature is on but the application facade is not configured", async () => {
    const original = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "public-api";
    try {
      const controller = new ReportPublicApiController(new ReportPublicApiService());

      await expect(controller.velocity({ orgId: "org-1", project_id: "project-1" })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("delegates burndown and velocity queries to the report application facade", async () => {
    const burndown = mock(async () => ({ data: [{ date: "2026-05-14", remaining: 8 }] }));
    const velocity = mock(async () => ({ data: [{ sprintId: "sprint-1", points: 13 }] }));
    const controller = new ReportPublicApiController(
      new ReportPublicApiService({
        featuresEnv: "public-api",
        application: { burndown, velocity },
      }),
    );

    await expect(controller.burndown({
      orgId: "org-1",
      project_id: "project-1",
      sprint_id: "sprint-1",
    })).resolves.toEqual({ data: [expect.objectContaining({ remaining: 8 })] });
    await expect(controller.velocity({ orgId: "org-1", project_id: "project-1" })).resolves.toEqual({
      data: [expect.objectContaining({ points: 13 })],
    });

    expect(burndown).toHaveBeenCalledWith({
      orgId: "org-1",
      projectId: "project-1",
      sprintId: "sprint-1",
    });
    expect(velocity).toHaveBeenCalledWith({ orgId: "org-1", projectId: "project-1" });
  });

  test("keeps request validation at the Nest boundary", () => {
    const burndown = Object.assign(new ReportBurndownQueryDto(), {
      orgId: "org-1",
      project_id: "project-1",
      sprint_id: "sprint-1",
    });
    const velocity = Object.assign(new ReportVelocityQueryDto(), {
      orgId: "org-1",
      project_id: "project-1",
    });
    const invalidBurndown = Object.assign(new ReportBurndownQueryDto(), { orgId: "", project_id: "" });
    const invalidVelocity = Object.assign(new ReportVelocityQueryDto(), { orgId: "", project_id: "" });

    expect(validateSync(burndown)).toHaveLength(0);
    expect(validateSync(velocity)).toHaveLength(0);
    expect(validateSync(invalidBurndown).map((error) => error.property)).toEqual(["orgId", "project_id"]);
    expect(validateSync(invalidVelocity).map((error) => error.property)).toEqual(["orgId", "project_id"]);
  });
});
