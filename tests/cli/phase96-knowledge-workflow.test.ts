import { describe, expect, test } from "bun:test";

describe("Phase 09.6 CLI knowledge workflow", () => {
  test("docs create can snapshot a task into a linked project doc", async () => {
    const { run } = await import("../../apps/cli/src/commands/docs.ts");
    const calls: unknown[] = [];
    const lines: string[] = [];
    const caller = {
      docs: {
        list: async () => [],
        get: async () => null,
        create: async (input: unknown) => {
          calls.push(input);
          return {
            id: "doc_1",
            title: "Implementation Notes",
            docType: "handoff",
            links: [{ targetKind: "task", targetId: "task_1", linkKind: "source" }],
            trace: { source: { kind: "task", id: "task_1" }, projectId: "proj_1" },
          };
        },
        update: async () => null,
        delete: async () => null,
      },
    };

    await run([
      "create",
      "--title",
      "Implementation Notes",
      "--type",
      "handoff",
      "--project",
      "proj_1",
      "--from-task",
      "task_1",
      "--link",
      "task:task_1",
      "--json",
    ], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    expect(calls[0]).toEqual({
      title: "Implementation Notes",
      docType: "handoff",
      projectId: "proj_1",
      source: { kind: "task", id: "task_1" },
      links: [{ targetKind: "task", targetId: "task_1", linkKind: "source" }],
    });
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      id: "doc_1",
      links: [{ targetKind: "task", targetId: "task_1" }],
      trace: { source: { kind: "task", id: "task_1" } },
    });
  });

  test("context preview forwards explicit scope and returns deterministic source refs", async () => {
    const { run } = await import("../../apps/cli/src/commands/context.ts");
    const calls: unknown[] = [];
    const lines: string[] = [];
    const caller = {
      context: {
        preview: async (input: unknown) => {
          calls.push(input);
          return {
            snapshotId: "ctx_1",
            scope: { projectId: "proj_1", taskId: "task_1", includeGlobal: true },
            sourceRefs: [
              { kind: "doc", id: "doc_1", reason: "linked-task-doc" },
              { kind: "memory", id: "mem_1", reason: "accepted-project-memory" },
            ],
            tokenEstimate: { used: 42, total: 8000 },
            warnings: [],
          };
        },
      },
    };

    await run([
      "preview",
      "--project",
      "proj_1",
      "--task",
      "task_1",
      "--include-global",
      "--json",
    ], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    expect(calls[0]).toEqual({ projectId: "proj_1", taskId: "task_1", includeGlobal: true });
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      snapshotId: "ctx_1",
      sourceRefs: [
        { kind: "doc", id: "doc_1", reason: "linked-task-doc" },
        { kind: "memory", id: "mem_1", reason: "accepted-project-memory" },
      ],
    });
  });
});
