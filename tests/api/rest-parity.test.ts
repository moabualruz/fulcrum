import "reflect-metadata";

import { describe, expect, it, mock } from "bun:test";

import { MODULE_METADATA } from "@nestjs/common/constants";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  TaskPublicApiController,
  TaskPublicApiModule,
  TaskPublicApiService,
} from "@work-management/interface/http/task-public-api.controller.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

describe("P13#05 task REST parity boundary closure", () => {
  it("uses the Nest task module as the public REST owner", () => {
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(appImports).toContain(TaskPublicApiModule);
  });

  it("returns canonical invariant errors instead of route-local stores when no facade is configured", async () => {
    const controller = new TaskPublicApiController(new TaskPublicApiService({ featuresEnv: "public-api" }));

    await expect(controller.listTasks({ orgId: ORG_ID, userId: USER_ID })).rejects.toThrow(
      "Application-backed REST task route is required.",
    );
  });

  it("delegates task reads through the application facade", async () => {
    const listTasks = mock(async () => [{ id: "task-1", title: "REST parity task" }]);
    const controller = new TaskPublicApiController(
      new TaskPublicApiService({
        featuresEnv: "public-api",
        application: {
          listTasks,
          createTask: async () => ({ id: "task-1" }),
          getTask: async () => ({ id: "task-1" }),
          patchTask: async () => ({ id: "task-1" }),
          deleteTask: async () => ({ id: "task-1" }),
        },
      }),
    );

    await expect(controller.listTasks({ orgId: ORG_ID, userId: USER_ID })).resolves.toEqual([
      { id: "task-1", title: "REST parity task" },
    ]);
    expect(listTasks).toHaveBeenCalledWith({ orgId: ORG_ID, userId: USER_ID, projectId: null, includeDeleted: undefined });
  });
});
