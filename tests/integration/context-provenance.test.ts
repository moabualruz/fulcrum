import { describe, expect, it } from "vitest";
import {
  ContextPackBuilder,
  exportContextPack,
  LocalTaskService,
  ProjectRegistryService,
  rankContextItems
} from "@fulcrum/core";
import { ContextItemSchema, SCHEMA_VERSION } from "@fulcrum/shared";
import {
  MemoryContextRepository,
  MemoryProjectRepository,
  MemoryTaskRepository
} from "./helpers/context-memory.js";

describe("context provenance and omissions", () => {
  it("ranks exact, path, and structural evidence ahead of weak semantic evidence", () => {
    const now = new Date(0).toISOString();
    const items = ["semantic", "structural", "path", "exact_code"].map((evidenceType, index) =>
      ContextItemSchema.parse({
        contextItemId: `ctxi_rank_${index}`,
        contextPackId: "ctx_rank",
        lane: "code",
        type: "evidence",
        sourceRef: { type: "file", uri: `file:///tmp/${evidenceType}.ts` },
        title: evidenceType,
        inclusionReason: "Ranking fixture.",
        freshness: now,
        evidenceType,
        budgetEstimate: 1,
        rank: 0,
        redactionStatus: "not_redacted",
        linkedRefs: [],
        createdAt: now,
        updatedAt: now,
        schemaVersion: SCHEMA_VERSION
      })
    );

    expect(rankContextItems(items).map((item) => item.evidenceType)).toEqual([
      "exact_code",
      "path",
      "structural",
      "semantic"
    ]);
  });

  it("keeps omitted source refs and exports markdown plus MCP resource content", () => {
    const projectRepo = new MemoryProjectRepository();
    const taskRepo = new MemoryTaskRepository();
    const projects = new ProjectRegistryService(projectRepo);
    const tasks = new LocalTaskService(taskRepo);
    const project = projects.register({ rootPath: process.cwd(), name: "Fulcrum" });
    const task = tasks.create({
      projectId: project.projectId,
      title: "A",
      description: "B"
    });
    const builder = new ContextPackBuilder(new MemoryContextRepository(), tasks, projects);

    const result = builder.build({
      taskId: task.taskId,
      budget: 2,
      now: new Date(0).toISOString()
    });
    const markdown = exportContextPack(result, "markdown");
    const resource = JSON.parse(exportContextPack(result, "mcp")) as {
      uri: string;
      mimeType: string;
      text: string;
    };

    expect(result.pack.omissions.length).toBeGreaterThan(0);
    expect(result.pack.omissions.every((omission) => omission.omittedRef?.uri)).toBe(true);
    expect(markdown).toContain("Redaction:");
    expect(markdown).toContain("Source:");
    expect(resource.uri).toBe(`fulcrum://context-packs/${result.pack.contextPackId}`);
    expect(resource.mimeType).toBe("application/json");
    expect(JSON.parse(resource.text).pack.contextPackId).toBe(result.pack.contextPackId);
  });
});
