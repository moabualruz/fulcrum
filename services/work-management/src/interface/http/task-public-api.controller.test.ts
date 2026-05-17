import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";

import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  RequestMethod,
  UnprocessableEntityException,
} from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  TaskCreateBodyDto,
  TaskCsvExportQueryDto,
  TaskCsvImportBodyDto,
  TaskDependenciesBodyDto,
  TaskIdParamsDto,
  TaskListQueryDto,
  TaskManualWorkbenchQueryDto,
  TaskParentBodyDto,
  TaskPatchBodyDto,
  TaskPublicApiController,
  TaskPublicApiModule,
  TaskPublicApiService,
} from "@work-management/interface/http/task-public-api.controller.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function task(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: TASK_ID,
    orgId: ORG_ID,
    userId: USER_ID,
    projectId: PROJECT_ID,
    title: "REST adapter task",
    status: "todo",
    createdAt: new Date("2026-05-14T00:00:00.000Z"),
    updatedAt: new Date("2026-05-14T00:00:00.000Z"),
    ...overrides,
  };
}

describe("task public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, TaskPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(TaskPublicApiController);
    expect(appImports).toContain(TaskPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, TaskPublicApiController)).toBe("api/v1");
    expect(Reflect.getMetadata(PATH_METADATA, TaskPublicApiController.prototype.listTasks)).toBe("tasks");
    expect(Reflect.getMetadata(METHOD_METADATA, TaskPublicApiController.prototype.listTasks)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, TaskPublicApiController.prototype.manualTaskWorkbench)).toBe(
      "tasks/manual-workbench",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, TaskPublicApiController.prototype.manualTaskWorkbench)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, TaskPublicApiController.prototype.createTask)).toBe("tasks");
    expect(Reflect.getMetadata(METHOD_METADATA, TaskPublicApiController.prototype.createTask)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PATH_METADATA, TaskPublicApiController.prototype.getTask)).toBe("tasks/:id");
    expect(Reflect.getMetadata(METHOD_METADATA, TaskPublicApiController.prototype.getTask)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, TaskPublicApiController.prototype.listTaskChildren)).toBe(
      "tasks/:id/children",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, TaskPublicApiController.prototype.listTaskChildren)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, TaskPublicApiController.prototype.patchTask)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(METHOD_METADATA, TaskPublicApiController.prototype.deleteTask)).toBe(RequestMethod.DELETE);
    expect(Reflect.getMetadata(PATH_METADATA, TaskPublicApiController.prototype.setTaskDependencies)).toBe(
      "tasks/:id/dependencies",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, TaskPublicApiController.prototype.setTaskDependencies)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(PATH_METADATA, TaskPublicApiController.prototype.setTaskParent)).toBe(
      "tasks/:id/parent",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, TaskPublicApiController.prototype.setTaskParent)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(PATH_METADATA, TaskPublicApiController.prototype.exportTasksCsv)).toBe(
      "connectors/export-csv",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, TaskPublicApiController.prototype.exportTasksCsv)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, TaskPublicApiController.prototype.importTasksCsv)).toBe(
      "connectors/import-csv",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, TaskPublicApiController.prototype.importTasksCsv)).toBe(
      RequestMethod.POST,
    );
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new TaskPublicApiController(new TaskPublicApiService());

      await expect(controller.listTasks({ orgId: ORG_ID, userId: USER_ID })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("fails closed when the public API feature is on but the task facade is not configured", async () => {
    const controller = new TaskPublicApiController(new TaskPublicApiService({ featuresEnv: "public-api" }));

    await expect(controller.listTasks({ orgId: ORG_ID, userId: USER_ID })).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  test("delegates task CRUD to the application facade and normalizes route input", async () => {
    const listTasks = mock(async () => [task()]);
    const buildManualWorkbench = mock(async () => ({
      projectId: PROJECT_ID,
      traceId: "trace-workbench",
      viewMode: "board",
      layout: "kanban",
      filtersApplied: 2,
      listRows: [{ id: TASK_ID, title: "Workbench task" }],
    }));
    const createTask = mock(async () => task({ id: "created-task" }));
    const getTask = mock(async () => task({ title: "Fetched task" }));
    const listTaskChildren = mock(async () => [task({ id: "child-task", parentId: TASK_ID })]);
    const patchTask = mock(async () => task({ title: "Updated task", status: "done" }));
    const deleteTask = mock(async () => task({ deletedAt: new Date("2026-05-14T01:00:00.000Z") }));
    const setTaskDependencies = mock(async () => ({
      id: TASK_ID,
      projectId: PROJECT_ID,
      dependencies: { blocks: ["blocked-task"], blocked_by: ["dependency-task"] },
    }));
    const setTaskParent = mock(async () => task({ parentId: "parent-task" }));
    const controller = new TaskPublicApiController(
      new TaskPublicApiService({
        featuresEnv: "public-api",
        application: {
          listTasks,
          buildManualWorkbench,
          createTask,
          getTask,
          listTaskChildren,
          patchTask,
          deleteTask,
          setTaskDependencies,
          setTaskParent,
        },
      }),
    );
    const tiptapContent = { type: "doc", content: [{ type: "paragraph" }] };

    await expect(controller.listTasks({ orgId: ORG_ID, userId: USER_ID, include_deleted: "true" })).resolves.toEqual([
      expect.objectContaining({ id: TASK_ID, createdAt: "2026-05-14T00:00:00.000Z" }),
    ]);
    await expect(controller.manualTaskWorkbench({
      orgId: ORG_ID,
      userId: USER_ID,
      project_id: PROJECT_ID,
      traceId: "trace-workbench",
      viewMode: "board",
      statuses: "in_progress",
      labels: "agent,ux",
      priorities: "3",
      projectCapabilitiesEstimateEnabled: "true",
    })).resolves.toEqual(expect.objectContaining({
      projectId: PROJECT_ID,
      traceId: "trace-workbench",
      layout: "kanban",
    }));
    await expect(controller.createTask({
      orgId: ORG_ID,
      userId: USER_ID,
      title: "REST adapter task",
      status: "todo",
      descriptionText: "Preserved description",
      tiptapContent,
      points: 5,
      assigneeId: USER_ID,
      project_id: PROJECT_ID,
    })).resolves.toEqual({ id: "created-task" });
    await expect(controller.getTask({ id: TASK_ID }, { orgId: ORG_ID, userId: USER_ID })).resolves.toEqual(
      expect.objectContaining({ title: "Fetched task" }),
    );
    await expect(controller.listTaskChildren(
      { id: TASK_ID },
      { orgId: ORG_ID, userId: USER_ID, project_id: PROJECT_ID },
    )).resolves.toEqual([expect.objectContaining({ id: "child-task", parentId: TASK_ID })]);
    await expect(controller.patchTask(
      { id: TASK_ID },
      { orgId: ORG_ID, userId: USER_ID, title: "Updated task", status: "done", project_id: PROJECT_ID },
    )).resolves.toEqual({ ok: true });
    await expect(controller.deleteTask({ id: TASK_ID }, { orgId: ORG_ID, userId: USER_ID })).resolves.toBeUndefined();
    await expect(controller.setTaskDependencies(
      { id: TASK_ID },
      {
        orgId: ORG_ID,
        userId: USER_ID,
        project_id: PROJECT_ID,
        blocks: ["blocked-task"],
        blocked_by: ["dependency-task"],
      },
    )).resolves.toEqual({
      id: TASK_ID,
      projectId: PROJECT_ID,
      dependencies: { blocks: ["blocked-task"], blocked_by: ["dependency-task"] },
    });
    await expect(controller.setTaskParent(
      { id: TASK_ID },
      { orgId: ORG_ID, userId: USER_ID, project_id: PROJECT_ID, parentId: "parent-task" },
    )).resolves.toEqual(expect.objectContaining({ parentId: "parent-task" }));

    expect(listTasks).toHaveBeenCalledWith({
      orgId: ORG_ID,
      userId: USER_ID,
      projectId: null,
      includeDeleted: true,
    });
    expect(buildManualWorkbench).toHaveBeenCalledWith({
      orgId: ORG_ID,
      userId: USER_ID,
      projectId: PROJECT_ID,
      traceId: "trace-workbench",
      viewMode: "board",
      filters: {
        statuses: ["in_progress"],
        stateGroups: undefined,
        labels: ["agent", "ux"],
        assigneeIds: undefined,
        cycleIds: undefined,
        moduleIds: undefined,
        taskTypes: undefined,
        priorities: [3],
        search: undefined,
      },
      projectCapabilities: { estimateEnabled: true },
    });
    expect(createTask).toHaveBeenCalledWith({
      orgId: ORG_ID,
      userId: USER_ID,
      projectId: PROJECT_ID,
      title: "REST adapter task",
      description: null,
      descriptionText: "Preserved description",
      tiptapContent,
      status: "todo",
      priority: undefined,
      points: 5,
      assigneeId: USER_ID,
    });
    expect(getTask).toHaveBeenCalledWith({ orgId: ORG_ID, userId: USER_ID, projectId: null, id: TASK_ID });
    expect(listTaskChildren).toHaveBeenCalledWith({
      orgId: ORG_ID,
      userId: USER_ID,
      projectId: PROJECT_ID,
      id: TASK_ID,
    });
    expect(patchTask).toHaveBeenCalledWith({
      orgId: ORG_ID,
      userId: USER_ID,
      projectId: PROJECT_ID,
      id: TASK_ID,
      title: "Updated task",
      status: "done",
    });
    expect(deleteTask).toHaveBeenCalledWith({ orgId: ORG_ID, userId: USER_ID, projectId: null, id: TASK_ID });
    expect(setTaskDependencies).toHaveBeenCalledWith({
      orgId: ORG_ID,
      userId: USER_ID,
      projectId: PROJECT_ID,
      id: TASK_ID,
      blocks: ["blocked-task"],
      blocked_by: ["dependency-task"],
    });
    expect(setTaskParent).toHaveBeenCalledWith({
      orgId: ORG_ID,
      userId: USER_ID,
      projectId: PROJECT_ID,
      id: TASK_ID,
      parentId: "parent-task",
    });
  });

  test("maps missing task facade results to Nest 404 and empty patches to 422", async () => {
    const controller = new TaskPublicApiController(
      new TaskPublicApiService({
        featuresEnv: "public-api",
        application: {
          listTasks: async () => [],
          createTask: async () => task(),
          getTask: async () => null,
          patchTask: async () => null,
          deleteTask: async () => null,
        },
      }),
    );

    await expect(controller.getTask({ id: TASK_ID }, { orgId: ORG_ID, userId: USER_ID })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.patchTask({ id: TASK_ID }, { orgId: ORG_ID, userId: USER_ID })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    await expect(controller.deleteTask({ id: TASK_ID }, { orgId: ORG_ID, userId: USER_ID })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test("keeps task CSV import and export behind task-specific feature flags", async () => {
    const exportTasks = mock(async () => "id,external_id,title,status,created_at\n1,EXT-1,Imported one,todo,2026-05-14");
    const importTasks = mock(async () => ({ created: 2, skipped: 0, errors: [] }));
    const controller = new TaskPublicApiController(
      new TaskPublicApiService({
        featuresEnv: "public-api,export-csv,import-csv",
        csvApplication: { exportTasks, importTasks },
      }),
    );
    const headers = new Map<string, string>();
    const response = { setHeader: (name: string, value: string) => headers.set(name, value) };

    await expect(controller.exportTasksCsv({ entity: "tasks", projectId: PROJECT_ID }, response)).resolves.toContain(
      "Imported one",
    );
    await expect(controller.importTasksCsv({
      entity: "tasks",
      projectId: PROJECT_ID,
      csv: "external_id,title,status\nEXT-1,Imported one,todo",
    })).resolves.toEqual({ created: 2, skipped: 0, errors: [] });

    expect(headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(headers.get("content-disposition")).toBe('attachment; filename="tasks.csv"');
    expect(exportTasks).toHaveBeenCalledWith({ projectId: PROJECT_ID });
    expect(importTasks).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      csv: "external_id,title,status\nEXT-1,Imported one,todo",
      columnMap: undefined,
    });

    const disabledExport = new TaskPublicApiController(
      new TaskPublicApiService({ featuresEnv: "public-api,import-csv", csvApplication: { exportTasks, importTasks } }),
    );
    await expect(disabledExport.exportTasksCsv({ entity: "tasks", projectId: PROJECT_ID })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  test("keeps request validation at the Nest boundary", () => {
    const listQuery = Object.assign(new TaskListQueryDto(), { orgId: ORG_ID, userId: USER_ID, include_deleted: "true" });
    const invalidListQuery = Object.assign(new TaskListQueryDto(), { orgId: "", userId: "" });
    const workbenchQuery = Object.assign(new TaskManualWorkbenchQueryDto(), {
      orgId: ORG_ID,
      userId: USER_ID,
      viewMode: "board",
      labels: "agent",
    });
    const invalidWorkbenchQuery = Object.assign(new TaskManualWorkbenchQueryDto(), {
      orgId: "",
      userId: "",
      viewMode: "calendar",
      labels: 5,
    });
    const params = Object.assign(new TaskIdParamsDto(), { id: TASK_ID });
    const invalidParams = Object.assign(new TaskIdParamsDto(), { id: "" });
    const body = Object.assign(new TaskCreateBodyDto(), { orgId: ORG_ID, userId: USER_ID, title: "Task" });
    const invalidBody = Object.assign(new TaskCreateBodyDto(), { orgId: "", userId: "", title: "" });
    const patch = Object.assign(new TaskPatchBodyDto(), { orgId: ORG_ID, userId: USER_ID, status: "done" });
    const invalidPatch = Object.assign(new TaskPatchBodyDto(), { orgId: "", userId: "", status: "unknown" });
    const dependencies = Object.assign(new TaskDependenciesBodyDto(), {
      orgId: ORG_ID,
      userId: USER_ID,
      blocks: [TASK_ID],
      blocked_by: [TASK_ID],
    });
    const invalidDependencies = Object.assign(new TaskDependenciesBodyDto(), {
      orgId: "",
      userId: "",
      blocks: [""],
      blocked_by: ["valid", 5],
    });
    const parentBody = Object.assign(new TaskParentBodyDto(), { orgId: ORG_ID, userId: USER_ID, parentId: TASK_ID });
    const clearParentBody = Object.assign(new TaskParentBodyDto(), { orgId: ORG_ID, userId: USER_ID, parentId: null });
    const invalidParentBody = Object.assign(new TaskParentBodyDto(), { orgId: "", userId: "", parentId: "" });
    const exportQuery = Object.assign(new TaskCsvExportQueryDto(), { entity: "tasks", projectId: PROJECT_ID });
    const invalidExportQuery = Object.assign(new TaskCsvExportQueryDto(), { entity: "docs", projectId: "" });
    const importBody = Object.assign(new TaskCsvImportBodyDto(), {
      entity: "tasks",
      projectId: PROJECT_ID,
      csv: "external_id,title,status\nEXT-1,Imported one,todo",
    });
    const invalidImportBody = Object.assign(new TaskCsvImportBodyDto(), { entity: "tasks", projectId: "", csv: "" });

    expect(validateSync(listQuery)).toHaveLength(0);
    expect(validateSync(invalidListQuery).map((error) => error.property)).toEqual(["orgId", "userId"]);
    expect(validateSync(workbenchQuery)).toHaveLength(0);
    expect(validateSync(invalidWorkbenchQuery).map((error) => error.property)).toEqual([
      "orgId",
      "userId",
      "labels",
      "viewMode",
    ]);
    expect(validateSync(params)).toHaveLength(0);
    expect(validateSync(invalidParams).map((error) => error.property)).toEqual(["id"]);
    expect(validateSync(body)).toHaveLength(0);
    expect(validateSync(invalidBody).map((error) => error.property)).toEqual(["orgId", "userId", "title"]);
    expect(validateSync(patch)).toHaveLength(0);
    expect(validateSync(invalidPatch).map((error) => error.property)).toEqual(["orgId", "userId", "status"]);
    expect(validateSync(dependencies)).toHaveLength(0);
    expect(validateSync(invalidDependencies).map((error) => error.property)).toEqual([
      "orgId",
      "userId",
      "blocks",
      "blocked_by",
    ]);
    expect(validateSync(parentBody)).toHaveLength(0);
    expect(validateSync(clearParentBody)).toHaveLength(0);
    expect(validateSync(invalidParentBody).map((error) => error.property)).toEqual([
      "orgId",
      "userId",
      "parentId",
    ]);
    expect(validateSync(exportQuery)).toHaveLength(0);
    expect(validateSync(invalidExportQuery).map((error) => error.property)).toEqual(["entity", "projectId"]);
    expect(validateSync(importBody)).toHaveLength(0);
    expect(validateSync(invalidImportBody).map((error) => error.property)).toEqual(["projectId", "csv"]);
  });
});
