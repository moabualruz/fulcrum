import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";

import { BadRequestException, InternalServerErrorException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  ProjectCreateBodyDto,
  ProjectCreateBodySchema,
  ProjectIdParamsDto,
  ProjectIdParamsSchema,
  ProjectListQueryDto,
  ProjectListQuerySchema,
  ProjectPatchBodyDto,
  ProjectPatchBodySchema,
  ProjectPublicApiController,
  ProjectPublicApiModule,
  ProjectPublicApiService,
  ProjectRequestContextDto,
  ProjectRequestContextSchema,
} from "@work-management/interface/http/project-public-api.controller.ts";

describe("project public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ProjectPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(ProjectPublicApiController);
    expect(appImports).toContain(ProjectPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, ProjectPublicApiController)).toBe("api/v1/projects");
    expect(Reflect.getMetadata(PATH_METADATA, ProjectPublicApiController.prototype.listProjects)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, ProjectPublicApiController.prototype.listProjects)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ProjectPublicApiController.prototype.createProject)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, ProjectPublicApiController.prototype.getProject)).toBe(":id");
    expect(Reflect.getMetadata(METHOD_METADATA, ProjectPublicApiController.prototype.getProject)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ProjectPublicApiController.prototype.patchProject)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ProjectPublicApiController.prototype.deleteProject)).toBe(
      RequestMethod.DELETE,
    );
    expect(Reflect.getMetadata(PATH_METADATA, ProjectPublicApiController.prototype.projectStats)).toBe(":id/stats");
    expect(Reflect.getMetadata(METHOD_METADATA, ProjectPublicApiController.prototype.projectStats)).toBe(
      RequestMethod.GET,
    );
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new ProjectPublicApiController(new ProjectPublicApiService());

      await expect(controller.listProjects({ orgId: "org-1" })).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("fails closed when the public API feature is on but the application facade is not configured", async () => {
    const original = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "public-api";
    try {
      const controller = new ProjectPublicApiController(new ProjectPublicApiService());

      await expect(controller.listProjects({ orgId: "org-1" })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("delegates project operations to the application facade", async () => {
    const listProjects = mock(async () => ({ data: [{ id: "project-1", name: "Project 1" }] }));
    const createProject = mock(async () => ({ id: "project-1", name: "Project 1", slug: "project-1" }));
    const getProject = mock(async () => ({ id: "project-1", name: "Project 1" }));
    const patchProject = mock(async () => ({
      id: "project-1",
      name: "Project 1 revised",
      memory_config: { token_budget: 8192 },
    }));
    const deleteProject = mock(async () => undefined);
    const projectStats = mock(async () => ({ projectId: "project-1", taskCount: 3 }));
    const controller = new ProjectPublicApiController(
      new ProjectPublicApiService({
        featuresEnv: "public-api",
        application: { listProjects, createProject, getProject, patchProject, deleteProject, projectStats },
      }),
    );

    await expect(controller.listProjects({ orgId: "org-1" })).resolves.toEqual({
      data: [expect.objectContaining({ id: "project-1" })],
    });
    await expect(controller.createProject({
      orgId: "org-1",
      kind: "project",
      name: "Project 1",
      slug: "project-1",
      description: "Project description",
      status: "active",
      ownerId: "user-1",
      traceId: "trace-project-1",
      repoPath: "/tmp/project-1",
      template: "default",
    })).resolves.toEqual(expect.objectContaining({ id: "project-1" }));
    await expect(controller.getProject({ id: "project-1" }, { orgId: "org-1" })).resolves.toEqual(
      expect.objectContaining({ id: "project-1" }),
    );
    await expect(controller.patchProject(
      { id: "project-1" },
      { orgId: "org-1", name: "Project 1 revised", memory_config: { token_budget: 8192 } },
    )).resolves.toEqual(expect.objectContaining({
      name: "Project 1 revised",
      memory_config: { token_budget: 8192 },
    }));
    await expect(controller.projectStats({ id: "project-1" }, { orgId: "org-1" })).resolves.toEqual(
      expect.objectContaining({ taskCount: 3 }),
    );
    await expect(controller.deleteProject({ id: "project-1" }, { orgId: "org-1" })).resolves.toBeUndefined();

    expect(listProjects).toHaveBeenCalledWith({ orgId: "org-1" });
    expect(createProject).toHaveBeenCalledWith({
      orgId: "org-1",
      kind: "project",
      name: "Project 1",
      slug: "project-1",
      description: "Project description",
      status: "active",
      ownerId: "user-1",
      traceId: "trace-project-1",
      repoPath: "/tmp/project-1",
      template: "default",
    });
    expect(getProject).toHaveBeenCalledWith({ orgId: "org-1", id: "project-1" });
    expect(patchProject).toHaveBeenCalledWith({
      orgId: "org-1",
      id: "project-1",
      name: "Project 1 revised",
      description: undefined,
      status: undefined,
      ownerId: undefined,
      memoryConfig: { token_budget: 8192 },
    });
    expect(projectStats).toHaveBeenCalledWith({ orgId: "org-1", id: "project-1" });
    expect(deleteProject).toHaveBeenCalledWith({ orgId: "org-1", id: "project-1" });
  });

  test("returns a Nest invariant error when a CRUD method has no application implementation", async () => {
    const controller = new ProjectPublicApiController(
      new ProjectPublicApiService({
        featuresEnv: "public-api",
        application: { listProjects: async () => ({ data: [] }) },
      }),
    );

    await expect(controller.createProject({ orgId: "org-1", kind: "project", name: "Project 1" })).rejects
      .toBeInstanceOf(InternalServerErrorException);
  });

  test("keeps Zod request validation at the Nest boundary", async () => {
    const query = Object.assign(new ProjectListQueryDto(), { orgId: "org-1" });
    const invalidQuery = Object.assign(new ProjectListQueryDto(), { orgId: "" });
    const params = Object.assign(new ProjectIdParamsDto(), { id: "project-1" });
    const invalidParams = Object.assign(new ProjectIdParamsDto(), { id: "" });
    const context = Object.assign(new ProjectRequestContextDto(), { orgId: "org-1" });
    const invalidContext = Object.assign(new ProjectRequestContextDto(), { orgId: "" });
    const body = Object.assign(new ProjectCreateBodyDto(), {
      orgId: "org-1",
      kind: "project",
      name: "Project 1",
      slug: "project-1",
      description: "Project description",
      status: "active",
      ownerId: "user-1",
      traceId: "trace-project-1",
      repoPath: "/tmp/project-1",
      template: "default",
    });
    const invalidBody = Object.assign(new ProjectCreateBodyDto(), { orgId: "", kind: "unknown", name: "" });
    const patch = Object.assign(new ProjectPatchBodyDto(), {
      orgId: "org-1",
      name: "Project 1 revised",
      memory_config: { token_budget: 8192 },
    });
    const invalidPatch = Object.assign(new ProjectPatchBodyDto(), { orgId: "", name: "" });

    expect(ProjectListQuerySchema.safeParse(query).success).toBe(true);
    expect(ProjectListQuerySchema.safeParse(invalidQuery).success).toBe(false);
    expect(ProjectIdParamsSchema.safeParse(params).success).toBe(true);
    expect(ProjectIdParamsSchema.safeParse(invalidParams).success).toBe(false);
    expect(ProjectRequestContextSchema.safeParse(context).success).toBe(true);
    expect(ProjectRequestContextSchema.safeParse(invalidContext).success).toBe(false);
    expect(ProjectCreateBodySchema.safeParse(body).success).toBe(true);
    expect(ProjectCreateBodySchema.safeParse(invalidBody).success).toBe(false);
    expect(ProjectPatchBodySchema.safeParse(patch).success).toBe(true);
    expect(ProjectPatchBodySchema.safeParse(invalidPatch).success).toBe(false);

    const controller = new ProjectPublicApiController(
      new ProjectPublicApiService({
        featuresEnv: "public-api",
        application: { listProjects: async () => ({ data: [] }) },
      }),
    );
    await expect(controller.listProjects(invalidQuery)).rejects.toBeInstanceOf(BadRequestException);
  });
});
