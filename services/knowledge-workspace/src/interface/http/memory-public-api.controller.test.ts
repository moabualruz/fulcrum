import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";

import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  RequestMethod,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  ContextPreviewPublicApiController,
  ContextPreviewQueryDto,
  CreateMemoryBodyDto,
  MemoryIdParamsDto,
  MemoryDigestBodyDto,
  MemoryListQueryDto,
  MemoryPatchBodyDto,
  MemoryPublicApiController,
  MemoryPublicApiModule,
  MemoryPublicApiService,
  MemorySearchQueryDto,
} from "@knowledge-workspace/interface/http/memory-public-api.controller.ts";

const MEMORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const AUTHORIZATION = `Bearer test-jwt:${ORG_ID}`;

function memoryRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: MEMORY_ID,
    orgId: ORG_ID,
    projectId: null,
    global: false,
    kind: "note",
    body: "Keep the planning context.",
    tags: ["planning"],
    importance: "medium",
    source: "manual",
    sourceRef: {},
    createdAt: new Date("2026-05-14T00:00:00.000Z"),
    updatedAt: new Date("2026-05-14T00:01:00.000Z"),
    archived: false,
    ...overrides,
  };
}

describe("memory public Nest API", () => {
  test("is wired as Nest controllers and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, MemoryPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(MemoryPublicApiController);
    expect(controllers).toContain(ContextPreviewPublicApiController);
    expect(appImports).toContain(MemoryPublicApiModule);

    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController)).toBe("api/v1/memory");
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.listMemories)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, MemoryPublicApiController.prototype.listMemories)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, MemoryPublicApiController.prototype.createMemory)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.searchMemories)).toBe("search");
    expect(Reflect.getMetadata(METHOD_METADATA, MemoryPublicApiController.prototype.searchMemories)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.getMemory)).toBe(":id");
    expect(Reflect.getMetadata(METHOD_METADATA, MemoryPublicApiController.prototype.patchMemory)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, MemoryPublicApiController.prototype.deleteMemory)).toBe(
      RequestMethod.DELETE,
    );
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.promoteMemory)).toBe(
      ":id/promote",
    );
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.archiveMemory)).toBe(
      ":id/archive",
    );
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.restoreMemory)).toBe(
      ":id/restore",
    );
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.digestMemories)).toBe("digest");
    expect(Reflect.getMetadata(METHOD_METADATA, MemoryPublicApiController.prototype.digestMemories)).toBe(
      RequestMethod.POST,
    );

    expect(Reflect.getMetadata(PATH_METADATA, ContextPreviewPublicApiController)).toBe("api/v1/context");
    expect(Reflect.getMetadata(PATH_METADATA, ContextPreviewPublicApiController.prototype.previewContext)).toBe(
      "preview",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ContextPreviewPublicApiController.prototype.previewContext)).toBe(
      RequestMethod.GET,
    );
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new MemoryPublicApiController(new MemoryPublicApiService());

      await expect(controller.listMemories({}, AUTHORIZATION)).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("requires Bearer authorization when the public API feature is on", async () => {
    const controller = new MemoryPublicApiController(
      new MemoryPublicApiService({
        featuresEnv: "public-api",
        application: {
          list: async () => [],
          create: async () => memoryRow(),
          get: async () => memoryRow(),
          update: async () => memoryRow(),
          delete: async () => ({ deleted: true }),
        },
      }),
    );

    await expect(controller.listMemories({}, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test("fails closed when the public API feature is on but the application facade is not configured", async () => {
    const controller = new MemoryPublicApiController(
      new MemoryPublicApiService({ featuresEnv: "public-api" }),
    );

    await expect(controller.listMemories({}, AUTHORIZATION)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  test("delegates memory list and CRUD to the memory application facade", async () => {
    const list = mock(async () => [memoryRow()]);
    const create = mock(async () => memoryRow({ body: "Created" }));
    const search = mock(async () => [memoryRow({ body: "Search match" })]);
    const get = mock(async () => memoryRow());
    const update = mock(async () => memoryRow({ body: "Updated" }));
    const remove = mock(async () => ({ deleted: true }));
    const controller = new MemoryPublicApiController(
      new MemoryPublicApiService({
        featuresEnv: "public-api",
        application: { list, create, search, get, update, delete: remove },
      }),
    );

    await expect(
      controller.listMemories(
        {
          tags: "api, memory",
          global: "true",
          archived: "false",
          limit: "10",
          offset: "1",
        },
        AUTHORIZATION,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: MEMORY_ID,
        createdAt: "2026-05-14T00:00:00.000Z",
      }),
    ]);
    await expect(controller.createMemory({ body: "Created", tags: ["api"] }, AUTHORIZATION)).resolves.toEqual(
      expect.objectContaining({ body: "Created" }),
    );
    await expect(controller.searchMemories({ query: "planning", projectId: "project-1" }, AUTHORIZATION)).resolves
      .toEqual([expect.objectContaining({ body: "Search match" })]);
    await expect(controller.getMemory({ id: MEMORY_ID }, AUTHORIZATION)).resolves.toEqual(
      expect.objectContaining({ id: MEMORY_ID }),
    );
    await expect(controller.patchMemory({ id: MEMORY_ID }, { body: "Updated" }, AUTHORIZATION)).resolves.toEqual(
      expect.objectContaining({ body: "Updated" }),
    );
    await expect(controller.deleteMemory({ id: MEMORY_ID }, { confirm: "true" }, AUTHORIZATION)).resolves.toEqual({
      deleted: true,
    });

    expect(list).toHaveBeenCalledWith({
      tags: ["api", "memory"],
      global: true,
      archived: false,
      limit: 10,
      offset: 1,
    });
    expect(create).toHaveBeenCalledWith({ body: "Created", tags: ["api"] });
    expect(search).toHaveBeenCalledWith({ query: "planning", projectId: "project-1" });
    expect(get).toHaveBeenCalledWith({ id: MEMORY_ID });
    expect(update).toHaveBeenCalledWith({ id: MEMORY_ID, body: "Updated" });
    expect(remove).toHaveBeenCalledWith({ id: MEMORY_ID });
  });

  test("preserves delete confirmation and empty patch validation", async () => {
    const controller = new MemoryPublicApiController(
      new MemoryPublicApiService({
        featuresEnv: "public-api",
        application: {
          list: async () => [],
          create: async () => memoryRow(),
          get: async () => memoryRow(),
          update: async () => memoryRow(),
          delete: async () => ({ deleted: true }),
        },
      }),
    );

    const deleteError = await controller.deleteMemory({ id: MEMORY_ID }, {}, AUTHORIZATION).catch((error) => error);
    expect(deleteError).toBeInstanceOf(BadRequestException);
    expect((deleteError as BadRequestException).getResponse()).toMatchObject({ code: "CONFIRM_REQUIRED" });
    await expect(controller.patchMemory({ id: MEMORY_ID }, { body: "" }, AUTHORIZATION)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  test("returns Nest 404 when memory facade lookups return nothing", async () => {
    const controller = new MemoryPublicApiController(
      new MemoryPublicApiService({
        featuresEnv: "public-api",
        application: {
          list: async () => [],
          create: async () => null,
          search: async () => [],
          get: async () => null,
          update: async () => null,
          delete: async () => null,
          promote: async () => null,
          archive: async () => null,
          restore: async () => null,
        },
      }),
    );

    await expect(controller.getMemory({ id: MEMORY_ID }, AUTHORIZATION)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.patchMemory({ id: MEMORY_ID }, { body: "Updated" }, AUTHORIZATION)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.promoteMemory({ id: MEMORY_ID }, AUTHORIZATION)).rejects.toBeInstanceOf(NotFoundException);
  });

  test("delegates memory actions and context preview", async () => {
    const promote = mock(async () => memoryRow({ importance: "high" }));
    const archive = mock(async () => memoryRow({ archived: true }));
    const restore = mock(async () => memoryRow({ archived: false }));
    const preview = mock(async (input: unknown) => ({ procedure: "context.preview", input }));
    const memoryController = new MemoryPublicApiController(
      new MemoryPublicApiService({
        featuresEnv: "public-api",
        application: {
          list: async () => [],
          create: async () => memoryRow(),
          get: async () => memoryRow(),
          update: async () => memoryRow(),
          delete: async () => ({ deleted: true }),
          promote,
          archive,
          restore,
        },
        context: { preview },
      }),
    );
    const contextController = new ContextPreviewPublicApiController(
      new MemoryPublicApiService({
        featuresEnv: "public-api",
        application: {
          list: async () => [],
          create: async () => memoryRow(),
          get: async () => memoryRow(),
          update: async () => memoryRow(),
          delete: async () => ({ deleted: true }),
        },
        context: { preview },
      }),
    );

    await expect(memoryController.promoteMemory({ id: MEMORY_ID }, AUTHORIZATION)).resolves.toEqual(
      expect.objectContaining({ importance: "high" }),
    );
    await expect(memoryController.archiveMemory({ id: MEMORY_ID }, AUTHORIZATION)).resolves.toEqual(
      expect.objectContaining({ archived: true }),
    );
    await expect(memoryController.restoreMemory({ id: MEMORY_ID }, AUTHORIZATION)).resolves.toEqual(
      expect.objectContaining({ archived: false }),
    );
    await expect(contextController.previewContext({
      taskId: "task-123",
      budget: "5000",
      includeGlobal: "true",
    }, AUTHORIZATION)).resolves.toEqual({
      procedure: "context.preview",
      input: { taskId: "task-123", budget: 5000, includeGlobal: true },
    });

    expect(promote).toHaveBeenCalledWith({ id: MEMORY_ID });
    expect(archive).toHaveBeenCalledWith({ id: MEMORY_ID });
    expect(restore).toHaveBeenCalledWith({ id: MEMORY_ID });
    expect(preview).toHaveBeenCalledWith({ taskId: "task-123", budget: 5000, includeGlobal: true });
  });

  test("creates memory digest documents through TypeORM-backed ports", async () => {
    const memories = [
      {
        body: "The project chose deterministic context retrieval.",
        kind: "decision",
        importance: "high",
      },
    ];
    const listDigestWindow = mock(async () => memories);
    const createDocument = mock(async () => ({ id: "doc-1" }));
    const summarize = mock(async () => "Digest summary");
    const controller = new MemoryPublicApiController(
      new MemoryPublicApiService(
        {
          featuresEnv: "public-api,report-llm-narration",
          digestClient: { summarize },
        },
        { listDigestWindow } as never,
        { create: createDocument } as never,
      ),
    );

    await expect(
      controller.digestMemories(
        { projectId: "project-1", since: "2026-05-01T00:00:00.000Z" },
        AUTHORIZATION,
      ),
    ).resolves.toEqual({
      docId: "doc-1",
      body: "Digest summary",
      projectId: "project-1",
      since: "2026-05-01T00:00:00.000Z",
    });
    expect(listDigestWindow).toHaveBeenCalledWith({
      projectId: "project-1",
      since: new Date("2026-05-01T00:00:00.000Z"),
    });
    expect(summarize).toHaveBeenCalledWith(memories);
    expect(createDocument).toHaveBeenCalledWith({
      projectId: "project-1",
      title: "Memory digest 2026-05-01",
      docType: "memory_digest",
      bodyMd: "Digest summary",
    });
  });

  test("gates memory digest behind the report narration feature flag", async () => {
    const controller = new MemoryPublicApiController(
      new MemoryPublicApiService(
        { featuresEnv: "public-api" },
        { listDigestWindow: mock(async () => []) } as never,
        { create: mock(async () => ({ id: "doc-1" })) } as never,
      ),
    );

    await expect(
      controller.digestMemories({ projectId: "project-1" }, AUTHORIZATION),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test("keeps request validation at the Nest boundary", () => {
    const params = Object.assign(new MemoryIdParamsDto(), { id: MEMORY_ID });
    const invalidParams = Object.assign(new MemoryIdParamsDto(), { id: "not-a-uuid" });
    const list = Object.assign(new MemoryListQueryDto(), { kind: "note", importance: "high", source: "manual" });
    const invalidList = Object.assign(new MemoryListQueryDto(), { kind: "unknown", importance: "unknown" });
    const body = Object.assign(new CreateMemoryBodyDto(), { body: "Remember this", kind: "decision" });
    const invalidBody = Object.assign(new CreateMemoryBodyDto(), { body: "", kind: "unknown" });
    const patch = Object.assign(new MemoryPatchBodyDto(), { body: "Updated", importance: "medium" });
    const invalidPatch = Object.assign(new MemoryPatchBodyDto(), { body: "", importance: "unknown" });
    const preview = Object.assign(new ContextPreviewQueryDto(), { taskId: "task-123", includeGlobal: "true" });
    const invalidPreview = Object.assign(new ContextPreviewQueryDto(), { taskId: "" });
    const digest = Object.assign(new MemoryDigestBodyDto(), { projectId: "project-1" });
    const invalidDigest = Object.assign(new MemoryDigestBodyDto(), { projectId: "" });
    const search = Object.assign(new MemorySearchQueryDto(), {
      query: "planning",
      projectId: "22222222-2222-4222-8222-222222222222",
    });
    const invalidSearch = Object.assign(new MemorySearchQueryDto(), { query: "" });

    expect(validateSync(params)).toHaveLength(0);
    expect(validateSync(invalidParams).map((error) => error.property)).toEqual(["id"]);
    expect(validateSync(list)).toHaveLength(0);
    expect(validateSync(invalidList).map((error) => error.property).sort()).toEqual(["importance", "kind"]);
    expect(validateSync(body)).toHaveLength(0);
    expect(validateSync(invalidBody).map((error) => error.property).sort()).toEqual(["body", "kind"]);
    expect(validateSync(patch)).toHaveLength(0);
    expect(validateSync(invalidPatch).map((error) => error.property).sort()).toEqual(["body", "importance"]);
    expect(validateSync(preview)).toHaveLength(0);
    expect(validateSync(invalidPreview).map((error) => error.property)).toEqual(["taskId"]);
    expect(validateSync(digest)).toHaveLength(0);
    expect(validateSync(invalidDigest).map((error) => error.property)).toEqual(["projectId"]);
    expect(validateSync(search)).toHaveLength(0);
    expect(validateSync(invalidSearch).map((error) => error.property)).toEqual(["query"]);
  });
});
