import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import { ExperimentStore } from "@feature-flags/application/experiments.ts";
import {
  FeatureExperimentAssignmentDto,
  FeatureExperimentConversionDto,
  FeatureExperimentCreateDto,
  FeatureExperimentMetricsQueryDto,
  FeatureExperimentParamsDto,
  FeatureExperimentPublicApiController,
  FeatureExperimentPublicApiModule,
  FeatureExperimentPublicApiService,
} from "@feature-flags/interface/http/controllers/feature-experiment-public-api.controller.ts";

describe("feature experiment public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, FeatureExperimentPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(FeatureExperimentPublicApiController);
    expect(appImports).toContain(FeatureExperimentPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, FeatureExperimentPublicApiController)).toBe(
      "api/v1/feature-flags/experiments",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, FeatureExperimentPublicApiController.prototype.list)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, FeatureExperimentPublicApiController.prototype.create)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, FeatureExperimentPublicApiController.prototype.assign)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, FeatureExperimentPublicApiController.prototype.recordConversion)).toBe(
      RequestMethod.POST,
    );
  });

  test("hides routes when public API or experiment feature is off", async () => {
    const controller = new FeatureExperimentPublicApiController(
      new FeatureExperimentPublicApiService({ featuresEnv: "public-api" }),
    );

    await expect(controller.list()).rejects.toBeInstanceOf(NotFoundException);
  });

  test("creates and reads experiment state through the application store", async () => {
    const store = new ExperimentStore();
    const controller = new FeatureExperimentPublicApiController(
      new FeatureExperimentPublicApiService({ featuresEnv: "public-api,experiments", store }),
    );

    const experiment = await controller.create({
      name: "layout",
      description: "layout test",
      variants: ["control", "dense"],
      rolloutPercent: 100,
    });
    const assigned = await controller.assign({ experimentId: experiment.id }, { userId: "user-1" });
    await expect(controller.recordConversion(
      { experimentId: experiment.id },
      { userId: "user-1", conversionKind: "task.created" },
    )).resolves.toEqual({ ok: true });

    await expect(controller.list()).resolves.toEqual([experiment]);
    await expect(controller.assignments({ experimentId: experiment.id })).resolves.toEqual({
      [assigned!.variant]: 1,
    });
    await expect(controller.metrics(
      { experimentId: experiment.id },
      { conversionKind: "task.created" },
    )).resolves.toEqual({
      control: {
        assigned: assigned!.variant === "control" ? 1 : 0,
        conversions: assigned!.variant === "control" ? 1 : 0,
      },
      dense: {
        assigned: assigned!.variant === "dense" ? 1 : 0,
        conversions: assigned!.variant === "dense" ? 1 : 0,
      },
    });
    await expect(controller.assignments({ experimentId: "missing" })).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.assign({ experimentId: "missing" }, { userId: "user-1" }))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.recordConversion(
      { experimentId: "missing" },
      { userId: "user-1", conversionKind: "task.created" },
    )).rejects.toBeInstanceOf(NotFoundException);
  });

  test("keeps request validation at the Nest boundary", () => {
    const create = Object.assign(new FeatureExperimentCreateDto(), {
      name: "layout",
      variants: ["control", "dense"],
      rolloutPercent: 50,
    });
    const invalidCreate = Object.assign(new FeatureExperimentCreateDto(), {
      name: "",
      variants: ["control"],
      rolloutPercent: 101,
    });
    const params = Object.assign(new FeatureExperimentParamsDto(), { experimentId: "exp-1" });
    const assignment = Object.assign(new FeatureExperimentAssignmentDto(), { userId: "user-1" });
    const conversion = Object.assign(new FeatureExperimentConversionDto(), {
      userId: "user-1",
      conversionKind: "task.created",
    });
    const metrics = Object.assign(new FeatureExperimentMetricsQueryDto(), { conversionKind: "task.created" });

    expect(validateSync(create)).toEqual([]);
    expect(validateSync(invalidCreate).map((error) => error.property)).toEqual([
      "name",
      "variants",
      "rolloutPercent",
    ]);
    expect(validateSync(params)).toEqual([]);
    expect(validateSync(assignment)).toEqual([]);
    expect(validateSync(conversion)).toEqual([]);
    expect(validateSync(metrics)).toEqual([]);
  });
});
