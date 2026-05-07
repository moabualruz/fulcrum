import { describe, expect, test } from "bun:test";

type MemoryRow = {
  id: string;
  projectId: string | null;
  global: boolean;
  kind: string;
  body: string;
  tags: string[];
  importance: string;
  archived: boolean;
};

type MemoryCaller = {
  memories: {
    list: (input?: Record<string, unknown>) => Promise<MemoryRow[]>;
    get: (input: { id: string }) => Promise<MemoryRow>;
    create: (input: Record<string, unknown>) => Promise<MemoryRow>;
    delete: (input: { id: string }) => Promise<{ deleted: true }>;
    search: (input: Record<string, unknown>) => Promise<Array<MemoryRow & { score: number }>>;
    promote: (input: { id: string }) => Promise<MemoryRow>;
  };
};

function fakeCaller(): MemoryCaller & { calls: Array<{ procedure: string; input: unknown }> } {
  const calls: Array<{ procedure: string; input: unknown }> = [];
  const rows: MemoryRow[] = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000010",
      global: false,
      kind: "decision",
      body: "Use deterministic memory retrieval.",
      tags: ["retrieval"],
      importance: "high",
      archived: false,
    },
  ];

  return {
    calls,
    memories: {
      list: async (input = {}) => {
        calls.push({ procedure: "memory.list", input });
        return rows;
      },
      get: async (input) => {
        calls.push({ procedure: "memory.get", input });
        return rows[0]!;
      },
      create: async (input) => {
        calls.push({ procedure: "memory.create", input });
        return { ...rows[0]!, ...(input as Partial<MemoryRow>), id: "00000000-0000-4000-8000-000000000002" };
      },
      delete: async (input) => {
        calls.push({ procedure: "memory.delete", input });
        return { deleted: true };
      },
      search: async (input) => {
        calls.push({ procedure: "memory.search", input });
        return [{ ...rows[0]!, score: 1.5 }];
      },
      promote: async (input) => {
        calls.push({ procedure: "memory.promote", input });
        return { ...rows[0]!, global: true };
      },
    },
  };
}

async function runMemory(argv: readonly string[], caller = fakeCaller()) {
  const { run } = await import("@fulcrum/cli/commands/memory.ts");
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | undefined;

  await run(argv, {
    caller,
    print: (line: string) => stdout.push(line),
    printErr: (line: string) => stderr.push(line),
    exit: (code: number) => {
      exitCode = code;
    },
  });

  return { caller, stdout, stderr, exitCode };
}

describe("memory CLI verbs", () => {
  test("list passes filters to memory.list and prints JSON", async () => {
    const { caller, stdout, exitCode } = await runMemory([
      "list",
      "--project",
      "00000000-0000-4000-8000-000000000010",
      "--kind",
      "decision",
      "--tag",
      "retrieval",
      "--importance",
      "high",
      "--archived",
      "--json",
    ]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      procedure: "memory.list",
      input: {
        projectId: "00000000-0000-4000-8000-000000000010",
        kind: "decision",
        tags: ["retrieval"],
        importance: "high",
        archived: true,
      },
    });
    expect(JSON.parse(stdout[0]!)).toHaveLength(1);
  });

  test("get calls memory.get and prints row JSON", async () => {
    const { caller, stdout, exitCode } = await runMemory([
      "get",
      "00000000-0000-4000-8000-000000000001",
      "--json",
    ]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      procedure: "memory.get",
      input: { id: "00000000-0000-4000-8000-000000000001" },
    });
    expect(JSON.parse(stdout[0]!).body).toBe("Use deterministic memory retrieval.");
  });

  test("add calls memory.create with manual body and metadata", async () => {
    const { caller, stdout, exitCode } = await runMemory([
      "add",
      "Remember this",
      "--global",
      "--tag",
      "cli",
      "--importance",
      "medium",
      "--kind",
      "note",
      "--json",
    ]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      procedure: "memory.create",
      input: {
        body: "Remember this",
        global: true,
        tags: ["cli"],
        importance: "medium",
        kind: "note",
      },
    });
    expect(JSON.parse(stdout[0]!).id).toBe("00000000-0000-4000-8000-000000000002");
  });

  test("delete calls memory.delete", async () => {
    const { caller, stdout, exitCode } = await runMemory([
      "delete",
      "00000000-0000-4000-8000-000000000001",
      "--json",
    ]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      procedure: "memory.delete",
      input: { id: "00000000-0000-4000-8000-000000000001" },
    });
    expect(JSON.parse(stdout[0]!)).toEqual({ deleted: true });
  });

  test("search calls memory.search with query and topK", async () => {
    const { caller, stdout, exitCode } = await runMemory([
      "search",
      "deterministic retrieval",
      "--project",
      "00000000-0000-4000-8000-000000000010",
      "--top",
      "5",
      "--json",
    ]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      procedure: "memory.search",
      input: {
      term: "deterministic retrieval",
        projectId: "00000000-0000-4000-8000-000000000010",
        topK: 5,
      },
    });
    expect(JSON.parse(stdout[0]!)[0].score).toBe(1.5);
  });

  test("promote calls memory.promote", async () => {
    const { caller, stdout, exitCode } = await runMemory([
      "promote",
      "00000000-0000-4000-8000-000000000001",
      "--json",
    ]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      procedure: "memory.promote",
      input: { id: "00000000-0000-4000-8000-000000000001" },
    });
    expect(JSON.parse(stdout[0]!).global).toBe(true);
  });
});
