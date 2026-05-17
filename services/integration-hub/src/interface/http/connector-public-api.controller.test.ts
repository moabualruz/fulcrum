import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  ConnectorParamsDto,
  ConnectorPublicApiController,
  ConnectorPublicApiModule,
  ConnectorPublicApiService,
  ConnectorRunListQueryDto,
  ConnectorRunPublicApiController,
  ConnectorStateBodyDto,
} from "@integration-hub/interface/http/connector-public-api.controller.ts";
import { ConnectorStore } from "@integration-hub/infrastructure/database/connector-store.ts";

describe("connector public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ConnectorPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(ConnectorPublicApiController);
    expect(controllers).toContain(ConnectorRunPublicApiController);
    expect(appImports).toContain(ConnectorPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, ConnectorPublicApiController)).toBe("api/v1/connectors");
    expect(Reflect.getMetadata(PATH_METADATA, ConnectorRunPublicApiController)).toBe("api/v1/connector-runs");
    expect(Reflect.getMetadata(METHOD_METADATA, ConnectorPublicApiController.prototype.list)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ConnectorPublicApiController.prototype.get)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ConnectorPublicApiController.prototype.enable)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ConnectorRunPublicApiController.prototype.listRuns)).toBe(
      RequestMethod.GET,
    );
  });

  test("hides routes when the public API feature is off", async () => {
    const controller = new ConnectorPublicApiController(new ConnectorPublicApiService({ featuresEnv: "" }));

    await expect(controller.list()).rejects.toBeInstanceOf(NotFoundException);
  });

  test("lists and gets global connector descriptors from feature flags", async () => {
    const controller = new ConnectorPublicApiController(
      new ConnectorPublicApiService({
        featuresEnv: "public-api",
        env: { FULCRUM_FEATURES: "connector-notion" } as NodeJS.ProcessEnv,
      }),
    );

    await expect(controller.list()).resolves.toEqual([
      { name: "confluence", enabled: false, config: null },
      { name: "notion", enabled: true, config: null },
      { name: "github-issues", enabled: false, config: null },
    ]);
    await expect(controller.get({ id: "notion" })).resolves.toEqual({
      name: "notion",
      enabled: true,
      config: null,
    });
    await expect(controller.get({ id: "missing" })).rejects.toBeInstanceOf(NotFoundException);
  });

  test("persists scoped connector state and runs through the store facade", async () => {
    const store = {
      list: async () => [{ name: "notion", enabled: true, config: { host: "https://notion.example" } }],
      get: async () => ({ name: "notion", enabled: true, config: { host: "https://notion.example" } }),
      enable: async () => ({ name: "notion", enabled: true, config: { host: "https://notion.example" } }),
      disable: async () => ({ name: "notion", enabled: false, config: { host: "https://notion.example" } }),
      sync: async () => ({
        id: "run-1",
        orgId: "org-1",
        connectorId: "notion",
        status: "queued",
        trigger: "manual",
        summary: null,
        startedAt: null,
        completedAt: null,
        createdAt: null,
      }),
      listRuns: async () => [{
        id: "run-1",
        orgId: "org-1",
        connectorId: "notion",
        status: "queued",
        trigger: "manual",
        summary: null,
        startedAt: null,
        completedAt: null,
        createdAt: null,
      }],
      getRun: async () => ({
        id: "run-1",
        orgId: "org-1",
        connectorId: "notion",
        status: "queued",
        trigger: "manual",
        summary: null,
        startedAt: null,
        completedAt: null,
        createdAt: null,
      }),
    } as unknown as ConnectorStore;
    const service = new ConnectorPublicApiService({ featuresEnv: "public-api" }, store);
    const controller = new ConnectorPublicApiController(service);
    const runController = new ConnectorRunPublicApiController(service);

    await expect(controller.enable({ id: "notion" }, {
      orgId: "org-1",
      config: { host: "https://notion.example" },
    })).resolves.toEqual({
      name: "notion",
      enabled: true,
      config: expect.objectContaining({ host: "https://notion.example" }),
    });
    await expect(controller.disable({ id: "notion" }, { orgId: "org-1" })).resolves.toEqual({
      name: "notion",
      enabled: false,
      config: expect.objectContaining({ host: "https://notion.example" }),
    });
    await expect(controller.sync({ id: "notion" }, { orgId: "org-1", trigger: "manual" }))
      .resolves.toEqual(expect.objectContaining({ id: "run-1", status: "queued" }));
    await expect(runController.listRuns({ orgId: "org-1", connectorId: "notion" }))
      .resolves.toEqual([expect.objectContaining({ id: "run-1", status: "queued" })]);
    await expect(runController.getRun({ id: "run-1" }, { orgId: "org-1" }))
      .resolves.toEqual(expect.objectContaining({ id: "run-1", status: "queued" }));
  });

  test("keeps request validation at the Nest boundary", () => {
    const params = Object.assign(new ConnectorParamsDto(), { id: "notion" });
    const invalidParams = Object.assign(new ConnectorParamsDto(), { id: "" });
    const body = Object.assign(new ConnectorStateBodyDto(), {
      orgId: "org-1",
      config: { host: "https://notion.example" },
    });
    const runQuery = Object.assign(new ConnectorRunListQueryDto(), {
      orgId: "org-1",
      connectorId: "notion",
    });

    expect(validateSync(params)).toEqual([]);
    expect(validateSync(invalidParams).map((error) => error.property)).toEqual(["id"]);
    expect(validateSync(body)).toEqual([]);
    expect(validateSync(runQuery)).toEqual([]);
  });
});
