import "reflect-metadata";

import { describe, expect, it } from "bun:test";
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import {
  ContextPreviewPublicApiController,
  MemoryPublicApiController,
  MemoryPublicApiService,
} from "@knowledge-workspace/interface/http/memory-public-api.controller.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const AUTHORIZATION = `Bearer test-jwt:${ORG_ID}`;

type MemoryRow = {
  id: string;
  orgId: string;
  projectId: string | null;
  global: boolean;
  kind: "note" | "decision" | "blocker" | "file_ref" | "section_anchor" | "link" | "fact";
  body: string;
  tags: string[];
  importance: "low" | "medium" | "high";
  source: "heuristic" | "llm" | "manual";
  sourceRef: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
};

function memoryControllers() {
  const rows = new Map<string, MemoryRow>();
  const memories = {
    list: async () => [...rows.values()],
    create: async (input: Partial<MemoryRow>) => {
      const now = new Date().toISOString();
      const memory: MemoryRow = {
        id: crypto.randomUUID(),
        orgId: ORG_ID,
        projectId: input.projectId ?? null,
        global: input.global ?? false,
        kind: input.kind ?? "note",
        body: input.body ?? "",
        tags: input.tags ?? [],
        importance: input.importance ?? "medium",
        source: input.source ?? "manual",
        sourceRef: input.sourceRef ?? {},
        createdAt: now,
        updatedAt: now,
        archived: false,
      };
      rows.set(memory.id, memory);
      return memory;
    },
    get: async ({ id }: { id: string }) => rows.get(id) ?? null,
    update: async ({ id, ...patch }: Partial<MemoryRow> & { id: string }) => {
      const current = rows.get(id);
      if (!current) return null;
      const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
      rows.set(id, updated);
      return updated;
    },
    delete: async ({ id }: { id: string }) => {
      rows.delete(id);
      return { deleted: true as const };
    },
    promote: async ({ id }: { id: string }) => rows.get(id) ?? null,
    archive: async ({ id }: { id: string }) => {
      const current = rows.get(id);
      if (!current) return null;
      const updated = { ...current, archived: true, updatedAt: new Date().toISOString() };
      rows.set(id, updated);
      return updated;
    },
    restore: async ({ id }: { id: string }) => {
      const current = rows.get(id);
      if (!current) return null;
      const updated = { ...current, archived: false, updatedAt: new Date().toISOString() };
      rows.set(id, updated);
      return updated;
    },
  };
  const service = new MemoryPublicApiService({
    featuresEnv: "public-api",
    application: memories,
    context: {
      preview: async (input: unknown) => ({ procedure: "context.preview", input }),
    },
  });

  return {
    memory: new MemoryPublicApiController(service),
    context: new ContextPreviewPublicApiController(service),
  };
}

describe("memory REST API Nest controller contract", () => {
  it("keeps all memory and context route metadata in Nest", () => {
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController)).toBe("api/v1/memory");
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.listMemories)).toBe("/");
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.createMemory)).toBe("/");
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.getMemory)).toBe(":id");
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.patchMemory)).toBe(":id");
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.deleteMemory)).toBe(":id");
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.promoteMemory)).toBe(":id/promote");
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.archiveMemory)).toBe(":id/archive");
    expect(Reflect.getMetadata(PATH_METADATA, MemoryPublicApiController.prototype.restoreMemory)).toBe(":id/restore");
    expect(Reflect.getMetadata(PATH_METADATA, ContextPreviewPublicApiController)).toBe("api/v1/context");
    expect(Reflect.getMetadata(PATH_METADATA, ContextPreviewPublicApiController.prototype.previewContext)).toBe(
      "preview",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, MemoryPublicApiController.prototype.listMemories)).toBe(0);
  });

  it("requires Bearer auth for memory routes", async () => {
    const { memory } = memoryControllers();

    await expect(memory.listMemories({}, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("creates, lists, and deletes memory rows", async () => {
    const { memory } = memoryControllers();

    const created = await memory.createMemory({
      body: "REST memory should call the same memory surface.",
      kind: "decision",
      tags: ["api", "memory"],
      importance: "high",
    }, AUTHORIZATION) as { id: string; body: string };
    expect(created.body).toBe("REST memory should call the same memory surface.");

    const list = await memory.listMemories({}, AUTHORIZATION) as Array<{ id: string }>;
    expect(list.map((row) => row.id)).toContain(created.id);

    await expect(memory.deleteMemory({ id: created.id }, { confirm: "true" }, AUTHORIZATION)).resolves.toEqual({
      deleted: true,
    });

    const afterDelete = await memory.listMemories({}, AUTHORIZATION) as Array<{ id: string }>;
    expect(afterDelete.map((row) => row.id)).not.toContain(created.id);
  });

  it("preserves delete confirmation and patch validation errors", async () => {
    const { memory } = memoryControllers();
    const created = await memory.createMemory({ body: "Patch me" }, AUTHORIZATION) as { id: string };

    await expect(memory.deleteMemory({ id: created.id }, {}, AUTHORIZATION)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(memory.patchMemory({ id: created.id }, { body: "" }, AUTHORIZATION)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it("supports memory actions and context preview", async () => {
    const { memory, context } = memoryControllers();
    const created = await memory.createMemory({ body: "Action me" }, AUTHORIZATION) as { id: string };

    await expect(memory.promoteMemory({ id: created.id }, AUTHORIZATION)).resolves.toMatchObject({ id: created.id });
    await expect(memory.archiveMemory({ id: created.id }, AUTHORIZATION)).resolves.toMatchObject({ archived: true });
    await expect(memory.restoreMemory({ id: created.id }, AUTHORIZATION)).resolves.toMatchObject({ archived: false });

    const preview = await context.previewContext({ taskId: "task-123" }, AUTHORIZATION) as {
      procedure: string;
      input: { taskId: string };
    };
    expect(preview.procedure).toBe("context.preview");
    expect(preview.input.taskId).toBe("task-123");
  });

  it("returns Nest 404 when memory actions target missing rows", async () => {
    const { memory } = memoryControllers();
    const missingId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    await expect(memory.getMemory({ id: missingId }, AUTHORIZATION)).rejects.toBeInstanceOf(NotFoundException);
    await expect(memory.promoteMemory({ id: missingId }, AUTHORIZATION)).rejects.toBeInstanceOf(NotFoundException);
  });
});
