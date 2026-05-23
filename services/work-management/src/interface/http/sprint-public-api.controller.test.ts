import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";

import { InternalServerErrorException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  SprintCreateBodyDto,
  SprintCloseBodyDto,
  SprintIdParamsDto,
  SprintListQueryDto,
  SprintPatchBodyDto,
  SprintPublicApiController,
  SprintPublicApiModule,
  SprintPublicApiService,
  SprintTaskBodyDto,
  SprintTaskParamsDto,
} from "@work-management/interface/http/sprint-public-api.controller.ts";

describe("sprint public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, SprintPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(SprintPublicApiController);
    expect(appImports).toContain(SprintPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, SprintPublicApiController)).toBe("api/v1/sprints");
    expect(Reflect.getMetadata(PATH_METADATA, SprintPublicApiController.prototype.listSprints)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, SprintPublicApiController.prototype.listSprints)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SprintPublicApiController.prototype.createSprint)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, SprintPublicApiController.prototype.createSprint)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SprintPublicApiController.prototype.getSprint)).toBe(":id");
    expect(Reflect.getMetadata(METHOD_METADATA, SprintPublicApiController.prototype.getSprint)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, SprintPublicApiController.prototype.patchSprint)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, SprintPublicApiController.prototype.deleteSprint)).toBe(
      RequestMethod.DELETE,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SprintPublicApiController.prototype.startSprint)).toBe(":id/start");
    expect(Reflect.getMetadata(METHOD_METADATA, SprintPublicApiController.prototype.startSprint)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SprintPublicApiController.prototype.closeSprint)).toBe(":id/close");
    expect(Reflect.getMetadata(METHOD_METADATA, SprintPublicApiController.prototype.closeSprint)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SprintPublicApiController.prototype.addTask)).toBe(":id/tasks");
    expect(Reflect.getMetadata(METHOD_METADATA, SprintPublicApiController.prototype.addTask)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SprintPublicApiController.prototype.removeTask)).toBe(":id/tasks/:taskId");
    expect(Reflect.getMetadata(METHOD_METADATA, SprintPublicApiController.prototype.removeTask)).toBe(
      RequestMethod.DELETE,
    );
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new SprintPublicApiController(new SprintPublicApiService());

      await expect(controller.listSprints({ orgId: "org-1", project_id: "project-1" })).rejects.toBeInstanceOf(
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
      const controller = new SprintPublicApiController(new SprintPublicApiService());

      await expect(controller.listSprints({ orgId: "org-1", project_id: "project-1" })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("delegates sprint list to the application facade with project scope", async () => {
    const listSprints = mock(async () => ({ data: [{ id: "sprint-1", name: "Sprint 1" }] }));
    const controller = new SprintPublicApiController(
      new SprintPublicApiService({
        featuresEnv: "public-api",
        application: { listSprints },
      }),
    );

    await expect(controller.listSprints({ orgId: "org-1", project_id: "project-1" })).resolves.toEqual({
      data: [expect.objectContaining({ id: "sprint-1", name: "Sprint 1" })],
    });
    expect(listSprints).toHaveBeenCalledWith({ orgId: "org-1", projectId: "project-1" });
  });

  test("delegates sprint CRUD methods when the application facade exposes them", async () => {
    const createSprint = mock(async () => ({ id: "sprint-1", name: "Sprint 1", status: "planning" }));
    const getSprint = mock(async () => ({ id: "sprint-1", name: "Sprint 1", status: "planning" }));
    const patchSprint = mock(async () => ({ id: "sprint-1", name: "Sprint 1 revised", status: "active" }));
    const deleteSprint = mock(async () => undefined);
    const startSprint = mock(async () => ({ id: "sprint-1", status: "active" }));
    const closeSprint = mock(async () => ({ closed: true, sprint: { id: "sprint-1", status: "completed" } }));
    const addTask = mock(async () => ({ id: "assignment-1", sprintId: "sprint-1", taskId: "task-1" }));
    const removeTask = mock(async () => ({ id: "assignment-1", sprintId: "sprint-1", taskId: "task-1" }));
    const controller = new SprintPublicApiController(
      new SprintPublicApiService({
        featuresEnv: "public-api",
        application: {
          listSprints: async () => ({ data: [] }),
          createSprint,
          getSprint,
          patchSprint,
          deleteSprint,
          startSprint,
          closeSprint,
          addTask,
          removeTask,
        },
      }),
    );

    await expect(controller.createSprint({
      orgId: "org-1",
      projectId: "project-1",
      name: "Sprint 1",
      status: "planning",
    })).resolves.toEqual(expect.objectContaining({ id: "sprint-1" }));
    await expect(controller.getSprint({ id: "sprint-1" }, { orgId: "org-1" })).resolves.toEqual(
      expect.objectContaining({ id: "sprint-1" }),
    );
    await expect(controller.patchSprint(
      { id: "sprint-1" },
      { orgId: "org-1", name: "Sprint 1 revised", status: "active" },
    )).resolves.toEqual(expect.objectContaining({ status: "active" }));
    await expect(controller.deleteSprint({ id: "sprint-1" }, { orgId: "org-1" })).resolves.toBeUndefined();
    await expect(controller.startSprint(
      { id: "sprint-1" },
      { orgId: "org-1" },
    )).resolves.toEqual(expect.objectContaining({ status: "active" }));
    await expect(controller.closeSprint(
      { id: "sprint-1" },
      { orgId: "org-1", unfinishedDisposition: "backlog" },
    )).resolves.toEqual(expect.objectContaining({ closed: true }));
    await expect(controller.addTask(
      { id: "sprint-1" },
      { orgId: "org-1", taskId: "task-1" },
    )).resolves.toEqual(expect.objectContaining({ taskId: "task-1" }));
    await expect(controller.removeTask(
      { id: "sprint-1", taskId: "task-1" },
      { orgId: "org-1" },
    )).resolves.toEqual(expect.objectContaining({ taskId: "task-1" }));

    expect(createSprint).toHaveBeenCalledWith({
      orgId: "org-1",
      projectId: "project-1",
      name: "Sprint 1",
      status: "planning",
    });
    expect(getSprint).toHaveBeenCalledWith({ orgId: "org-1", id: "sprint-1" });
    expect(patchSprint).toHaveBeenCalledWith({
      orgId: "org-1",
      id: "sprint-1",
      name: "Sprint 1 revised",
      status: "active",
    });
    expect(deleteSprint).toHaveBeenCalledWith({ orgId: "org-1", id: "sprint-1" });
    expect(startSprint).toHaveBeenCalledWith({ orgId: "org-1", id: "sprint-1" });
    expect(closeSprint).toHaveBeenCalledWith({ orgId: "org-1", id: "sprint-1", unfinishedDisposition: "backlog" });
    expect(addTask).toHaveBeenCalledWith({ orgId: "org-1", id: "sprint-1", taskId: "task-1" });
    expect(removeTask).toHaveBeenCalledWith({ orgId: "org-1", id: "sprint-1", taskId: "task-1" });
  });

  test("returns a Nest invariant error when a CRUD method has no application implementation", async () => {
    const controller = new SprintPublicApiController(
      new SprintPublicApiService({
        featuresEnv: "public-api",
        application: { listSprints: async () => ({ data: [] }) },
      }),
    );

    await expect(controller.createSprint({ orgId: "org-1", name: "Sprint 1" })).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  test("keeps request validation at the Nest boundary", () => {
    const query = Object.assign(new SprintListQueryDto(), { orgId: "org-1", project_id: "project-1" });
    const invalidQuery = Object.assign(new SprintListQueryDto(), { orgId: "", project_id: "" });
    const params = Object.assign(new SprintIdParamsDto(), { id: "sprint-1" });
    const invalidParams = Object.assign(new SprintIdParamsDto(), { id: "" });
    const body = Object.assign(new SprintCreateBodyDto(), {
      orgId: "org-1",
      projectId: "project-1",
      name: "Sprint 1",
      status: "planning",
    });
    const invalidBody = Object.assign(new SprintCreateBodyDto(), { orgId: "", name: "", status: "unknown" });
    const patch = Object.assign(new SprintPatchBodyDto(), { orgId: "org-1", status: "active" });
    const invalidPatch = Object.assign(new SprintPatchBodyDto(), { orgId: "", status: "unknown" });
    const close = Object.assign(new SprintCloseBodyDto(), { orgId: "org-1", unfinishedDisposition: "backlog" });
    const invalidClose = Object.assign(new SprintCloseBodyDto(), { orgId: "", unfinishedDisposition: "archive" });
    const taskParams = Object.assign(new SprintTaskParamsDto(), { id: "sprint-1", taskId: "task-1" });
    const invalidTaskParams = Object.assign(new SprintTaskParamsDto(), { id: "", taskId: "" });
    const taskBody = Object.assign(new SprintTaskBodyDto(), { orgId: "org-1", taskId: "task-1" });
    const invalidTaskBody = Object.assign(new SprintTaskBodyDto(), { orgId: "", taskId: "" });

    expect(validateSync(query)).toHaveLength(0);
    expect(validateSync(invalidQuery).map((error) => error.property)).toEqual(["orgId", "project_id"]);
    expect(validateSync(params)).toHaveLength(0);
    expect(validateSync(invalidParams).map((error) => error.property)).toEqual(["id"]);
    expect(validateSync(body)).toHaveLength(0);
    expect(validateSync(invalidBody).map((error) => error.property)).toEqual(["orgId", "name", "status"]);
    expect(validateSync(patch)).toHaveLength(0);
    expect(validateSync(invalidPatch).map((error) => error.property)).toEqual(["orgId", "status"]);
    expect(validateSync(close)).toHaveLength(0);
    expect(validateSync(invalidClose).map((error) => error.property)).toEqual(["orgId", "unfinishedDisposition"]);
    expect(validateSync(taskParams)).toHaveLength(0);
    expect(validateSync(invalidTaskParams).map((error) => error.property)).toEqual(["id", "taskId"]);
    expect(validateSync(taskBody)).toHaveLength(0);
    expect(validateSync(invalidTaskBody).map((error) => error.property)).toEqual(["orgId", "taskId"]);
  });
});
