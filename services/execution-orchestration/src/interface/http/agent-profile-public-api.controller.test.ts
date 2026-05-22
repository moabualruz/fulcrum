import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  AgentProfilePublicApiController,
  AgentProfilePublicApiModule,
  AgentProfilePublicApiService,
} from "@execution-orchestration/interface/http/agent-profile-public-api.controller.ts";

describe("agent-profile public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AgentProfilePublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(AgentProfilePublicApiController);
    expect(appImports).toContain(AgentProfilePublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, AgentProfilePublicApiController)).toBe("api/v1/agents");
    expect(Reflect.getMetadata(PATH_METADATA, AgentProfilePublicApiController.prototype.listAgents)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, AgentProfilePublicApiController.prototype.listAgents)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AgentProfilePublicApiController.prototype.getAgent)).toBe(":name");
    expect(Reflect.getMetadata(METHOD_METADATA, AgentProfilePublicApiController.prototype.getAgent)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AgentProfilePublicApiController.prototype.testAgent)).toBe("test");
    expect(Reflect.getMetadata(METHOD_METADATA, AgentProfilePublicApiController.prototype.testAgent)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AgentProfilePublicApiController.prototype.connectBridge)).toBe(
      "sessions/connect",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AgentProfilePublicApiController.prototype.connectBridge)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AgentProfilePublicApiController.prototype.resolvePermission)).toBe(
      "sessions/permissions/resolve",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AgentProfilePublicApiController.prototype.resolvePermission)).toBe(
      RequestMethod.POST,
    );
  });

  test("fails closed when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new AgentProfilePublicApiController(new AgentProfilePublicApiService());

      await expect(controller.listAgents({ orgId: "org-1" })).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
