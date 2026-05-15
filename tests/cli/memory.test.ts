import { describe, expect, test } from "bun:test";
import type { MemoryRunOptions } from "@fulcrum/cli/commands/memory.ts";

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
    digest: (input: { projectId: string; since?: string }) => Promise<{
      docId: string;
      body: string;
      projectId: string;
      since: string;
    } | null>;
  };
};

function fakeCaller(): MemoryCaller & { calls: Array<{ operation: string; input: unknown }> } {
  const calls: Array<{ operation: string; input: unknown }> = [];
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
        calls.push({ operation: "memory.list", input });
        return rows;
      },
      get: async (input) => {
        calls.push({ operation: "memory.get", input });
        return rows[0]!;
      },
      create: async (input) => {
        calls.push({ operation: "memory.create", input });
        return { ...rows[0]!, ...(input as Partial<MemoryRow>), id: "00000000-0000-4000-8000-000000000002" };
      },
      delete: async (input) => {
        calls.push({ operation: "memory.delete", input });
        return { deleted: true };
      },
      search: async (input) => {
        calls.push({ operation: "memory.search", input });
        return [{ ...rows[0]!, score: 1.5 }];
      },
      promote: async (input) => {
        calls.push({ operation: "memory.promote", input });
        return { ...rows[0]!, global: true };
      },
      digest: async (input) => {
        calls.push({ operation: "memory.digest", input });
        return {
          docId: "00000000-0000-4000-8000-000000000003",
          body: "Digest summary",
          projectId: input.projectId,
          since: input.since ?? "2026-05-01T00:00:00.000Z",
        };
      },
    },
  };
}

async function runMemory(argv: readonly string[], caller = fakeCaller()) {
  return {
    caller,
    ...await runMemoryWithOptions(argv, { caller }),
  };
}

async function runMemoryWithOptions(
  argv: readonly string[],
  options: MemoryRunOptions = {},
) {
  const { run } = await import("@fulcrum/cli/commands/memory.ts");
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | undefined;

  await run(argv, {
    ...options,
    print: (line: string) => stdout.push(line),
    printErr: (line: string) => stderr.push(line),
    exit: (code: number) => {
      exitCode = code;
    },
  });

  return { stdout, stderr, exitCode };
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
      operation: "memory.list",
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
      operation: "memory.get",
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
      operation: "memory.create",
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
      operation: "memory.delete",
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
      operation: "memory.search",
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
      operation: "memory.promote",
      input: { id: "00000000-0000-4000-8000-000000000001" },
    });
    expect(JSON.parse(stdout[0]!).global).toBe(true);
  });

  test("digest calls memory.digest and prints the generated doc result", async () => {
    const { caller, stdout, exitCode } = await runMemory([
      "digest",
      "--project",
      "project-1",
      "--since",
      "2026-05-01T00:00:00.000Z",
      "--json",
    ]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      operation: "memory.digest",
      input: {
        projectId: "project-1",
        since: "2026-05-01T00:00:00.000Z",
      },
    });
    expect(JSON.parse(stdout[0]!)).toEqual({
      docId: "00000000-0000-4000-8000-000000000003",
      body: "Digest summary",
      projectId: "project-1",
      since: "2026-05-01T00:00:00.000Z",
    });
  });

  test("digest prints an empty-window message when the API returns null", async () => {
    const caller = fakeCaller();
    caller.memories.digest = async (input) => {
      caller.calls.push({ operation: "memory.digest", input });
      return null;
    };

    const result = await runMemoryWithOptions(["digest", "--project", "project-1"], { caller });

    expect(result.exitCode).toBeUndefined();
    expect(result.stdout).toEqual(["No memories in window to digest."]);
  });

  test("routes through the memory public API when no caller is injected", async () => {
    const requests: Array<[string, string, unknown?, string?]> = [];
    const fetchFn = (async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const authorization = new Headers(init?.headers).get("authorization") ?? undefined;
      requests.push([method, url, body, authorization]);

      if (url.endsWith("/api/v1/memory/digest")) {
        return Response.json({
          docId: "doc-1",
          body: "Digest summary",
          projectId: "project-1",
          since: "2026-05-01T00:00:00.000Z",
        });
      }
      if (url.includes("/search")) return Response.json([{ id: "memory-search", body: "Found" }]);
      if (url.includes("/promote")) return Response.json({ id: "memory-1", global: true });
      if (method === "POST") return Response.json({ id: "memory-created", ...body });
      if (method === "DELETE") return Response.json({ deleted: true });
      if (url.endsWith("/api/v1/memory/memory-1")) return Response.json({ id: "memory-1", body: "One" });
      return Response.json([{ id: "memory-1", body: "One" }]);
    }) as typeof fetch;
    const options: MemoryRunOptions = {
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210",
        FULCRUM_API_TOKEN: "token-1",
      },
      fetch: fetchFn,
    };

    const list = await runMemoryWithOptions(["list", "--project", "project-1", "--json"], options);
    const add = await runMemoryWithOptions(["add", "Remember API", "--global", "--json"], options);
    const search = await runMemoryWithOptions(["search", "Remember", "--top", "5", "--json"], options);
    const promote = await runMemoryWithOptions(["promote", "memory-1", "--json"], options);
    const deleted = await runMemoryWithOptions(["delete", "memory-1", "--json"], options);
    const digest = await runMemoryWithOptions([
      "digest",
      "--project",
      "project-1",
      "--since",
      "2026-05-01T00:00:00.000Z",
      "--json",
    ], options);

    expect([list, add, search, promote, deleted, digest].every((result) => result.exitCode === undefined)).toBe(true);
    expect(JSON.parse(list.stdout[0] as string)).toEqual([{ id: "memory-1", body: "One" }]);
    expect(JSON.parse(add.stdout[0] as string)).toMatchObject({ id: "memory-created", body: "Remember API", global: true });
    expect(JSON.parse(search.stdout[0] as string)).toEqual([{ id: "memory-search", body: "Found" }]);
    expect(JSON.parse(promote.stdout[0] as string)).toMatchObject({ id: "memory-1", global: true });
    expect(JSON.parse(deleted.stdout[0] as string)).toEqual({ deleted: true });
    expect(JSON.parse(digest.stdout[0] as string)).toMatchObject({ docId: "doc-1", body: "Digest summary" });
    expect(requests).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/memory?projectId=project-1", undefined, "Bearer token-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/memory", { body: "Remember API", global: true }, "Bearer token-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/memory/search?limit=5&query=Remember", undefined, "Bearer token-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/memory/memory-1/promote", undefined, "Bearer token-1"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/memory/memory-1?confirm=true", undefined, "Bearer token-1"],
      [
        "POST",
        "http://127.0.0.1:3210/api/v1/memory/digest",
        { projectId: "project-1", since: "2026-05-01T00:00:00.000Z" },
        "Bearer token-1",
      ],
    ]);
  });

  test("requires the memory public API when no caller is injected", async () => {
    const result = await runMemoryWithOptions(["list", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toEqual([]);
    expect(result.stderr.join("\n")).toContain("Memory API caller is not configured");
  });
});
