import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import { FeatureFlagStore, type FeatureFlagPublicRow } from "@feature-flags/infrastructure/database/repositories/feature-flag-store.ts";
import {
  FeatureFlagEvaluateQueryDto,
  FeatureFlagListQueryDto,
  FeatureFlagPublicApiController,
  FeatureFlagPublicApiModule,
  FeatureFlagPublicApiService,
  FeatureFlagRolloutDto,
  FeatureFlagSetDto,
} from "@feature-flags/interface/http/controllers/feature-flag-public-api.controller.ts";

describe("feature flag public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, FeatureFlagPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(FeatureFlagPublicApiController);
    expect(appImports).toContain(FeatureFlagPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, FeatureFlagPublicApiController)).toBe("api/v1/feature-flags");
    expect(Reflect.getMetadata(METHOD_METADATA, FeatureFlagPublicApiController.prototype.list)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, FeatureFlagPublicApiController.prototype.evaluate)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, FeatureFlagPublicApiController.prototype.set)).toBe(RequestMethod.PATCH);
  });

  test("hides routes when public API feature is off", async () => {
    const controller = new FeatureFlagPublicApiController(
      new FeatureFlagPublicApiService({ featuresEnv: "" }, {} as FeatureFlagStore),
    );

    await expect(controller.list({})).rejects.toBeInstanceOf(NotFoundException);
  });

  test("delegates list, evaluate, set, override, and rollout to the TypeORM store facade", async () => {
    const row: FeatureFlagPublicRow = {
      flag: "public-api",
      description: "Public API",
      enabled: true,
      rolloutPercent: 100,
      source: "org",
    };
    const store = {
      list: async () => [row],
      evaluate: async () => row,
      set: async () => ({ ...row, source: "user" }),
      setOverride: async () => ({ ...row, enabled: false, source: "org" }),
      setRollout: async () => ({ ...row, flag: "router-llm", rolloutPercent: 25, source: "org" }),
    } as unknown as FeatureFlagStore;
    const controller = new FeatureFlagPublicApiController(
      new FeatureFlagPublicApiService({ featuresEnv: "public-api" }, store),
    );

    await expect(controller.list({ orgId: "org-1", userId: "user-1" })).resolves.toEqual([row]);
    await expect(controller.evaluate({
      flag: "public-api",
      orgId: "org-1",
      userId: "user-1",
    })).resolves.toEqual(row);
    await expect(controller.set({
      flag: "public-api",
      orgId: "org-1",
      userId: "user-1",
      enabled: true,
    })).resolves.toEqual({ ...row, source: "user" });
    await expect(controller.setOverride({
      flag: "public-api",
      orgId: "org-1",
      enabled: false,
    })).resolves.toEqual({ ...row, enabled: false, source: "org" });
    await expect(controller.setRollout({
      flag: "router-llm",
      orgId: "org-1",
      rolloutPercent: 25,
    })).resolves.toEqual({ ...row, flag: "router-llm", rolloutPercent: 25 });
  });

  test("keeps request validation at the Nest boundary", () => {
    const list = Object.assign(new FeatureFlagListQueryDto(), { orgId: "org-1", userId: "user-1" });
    const evaluate = Object.assign(new FeatureFlagEvaluateQueryDto(), {
      flag: "public-api",
      orgId: "org-1",
      userId: "user-1",
    });
    const set = Object.assign(new FeatureFlagSetDto(), {
      flag: "public-api",
      orgId: "org-1",
      userId: "user-1",
      enabled: true,
    });
    const rollout = Object.assign(new FeatureFlagRolloutDto(), {
      flag: "router-llm",
      orgId: "org-1",
      rolloutPercent: 25,
    });

    expect(validateSync(list)).toEqual([]);
    expect(validateSync(evaluate)).toEqual([]);
    expect(validateSync(set)).toEqual([]);
    expect(validateSync(rollout)).toEqual([]);
  });
});
