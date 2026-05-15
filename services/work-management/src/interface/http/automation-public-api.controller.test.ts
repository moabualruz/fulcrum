import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import { AutomationStore } from "@work-management/infrastructure/database/automation-store.ts";
import {
  AutomationCreateDto,
  AutomationIdParamsDto,
  AutomationListQueryDto,
  AutomationPublicApiController,
  AutomationPublicApiModule,
  AutomationPublicApiService,
  AutomationUpdateDto,
} from "@work-management/interface/http/automation-public-api.controller.ts";

describe("automation public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AutomationPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(AutomationPublicApiController);
    expect(appImports).toContain(AutomationPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, AutomationPublicApiController)).toBe("api/v1/automations");
    expect(Reflect.getMetadata(METHOD_METADATA, AutomationPublicApiController.prototype.listAutomations)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AutomationPublicApiController.prototype.createAutomation)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AutomationPublicApiController.prototype.updateAutomation)).toBe(
      RequestMethod.PATCH,
    );
  });

  test("hides routes when public API feature is off", async () => {
    const controller = new AutomationPublicApiController(
      new AutomationPublicApiService({ featuresEnv: "" }, {} as AutomationStore),
    );

    await expect(controller.listAutomations({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  test("delegates CRUD and templates to the TypeORM store facade", async () => {
    const automationRow = {
      id: "auto-1",
      orgId: "org-1",
      projectId: "project-1",
      name: "Auto triage",
      triggerType: "task.created",
      triggerConfig: null,
      condition: null,
      actionType: "set_status",
      actionConfig: { status: "triage" },
      enabled: true,
      executionCount: 0,
      createdAt: null,
      updatedAt: null,
    };
    const updatedAutomationRow = {
      ...automationRow,
      name: "Auto triage updated",
      enabled: false,
    };
    const automationTemplate = {
      name: "Close stale tasks",
      description: "Automatically close tasks that have not been updated in 30 days",
      triggerType: "task.stale_detected",
      triggerConfig: { staleDays: 30 },
      condition: null,
      actionType: "set_status",
      actionConfig: { status: "closed" },
    };
    const store = {
      list: async () => [automationRow],
      create: async () => automationRow,
      update: async () => updatedAutomationRow,
      delete: async () => true,
      templates: () => [automationTemplate],
    } as unknown as AutomationStore;
    const controller = new AutomationPublicApiController(
      new AutomationPublicApiService({ featuresEnv: "public-api" }, store),
    );

    await expect(controller.listAutomations({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
    })).resolves.toEqual([automationRow]);
    await expect(controller.createAutomation({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      name: "Auto triage",
      triggerType: "task.created",
      actionType: "set_status",
    })).resolves.toEqual(automationRow);
    await expect(controller.updateAutomation({ id: "auto-1" }, {
      orgId: "org-1",
      userId: "user-1",
      enabled: false,
    })).resolves.toEqual(updatedAutomationRow);
    await expect(controller.templates()).resolves.toEqual([automationTemplate]);
    await expect(controller.deleteAutomation({ id: "auto-1" }, {
      orgId: "org-1",
      userId: "user-1",
    })).resolves.toEqual({ deleted: true });
  });

  test("keeps request validation at the Nest boundary", () => {
    const query = Object.assign(new AutomationListQueryDto(), {
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
    });
    const params = Object.assign(new AutomationIdParamsDto(), { id: "auto-1" });
    const create = Object.assign(new AutomationCreateDto(), {
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      name: "Auto triage",
      triggerType: "task.created",
      condition: { field: "priority", operator: "equals", value: "high" },
      actionType: "set_status",
      actionConfig: { status: "triage" },
    });
    const update = Object.assign(new AutomationUpdateDto(), {
      orgId: "org-1",
      userId: "user-1",
      enabled: false,
    });

    expect(validateSync(query)).toEqual([]);
    expect(validateSync(params)).toEqual([]);
    expect(validateSync(create)).toEqual([]);
    expect(validateSync(update)).toEqual([]);
  });
});
