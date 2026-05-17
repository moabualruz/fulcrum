import { describe, expect, it } from "bun:test";

type SearchKind = "task" | "doc" | "memory" | "artifact" | "repo" | "agent_run";

interface SearchResult {
  id: string;
  kind: SearchKind;
  title: string;
}

function fakeCaller() {
  const calls: unknown[] = [];
  return {
    calls,
    search: {
      query: async (input: unknown) => {
        calls.push(["query", input]);
        return {
          results: [
            { id: "task-1", kind: "task", title: "Foo task" },
          ] satisfies SearchResult[],
          total: 1,
        };
      },
      suggest: async (input: unknown) => {
        calls.push(["suggest", input]);
        return {
          suggestions: [
            { value: "foo task", kind: "task", label: "Foo task" },
          ],
        };
      },
      savedList: async (input: unknown) => {
        calls.push(["savedList", input]);
        return [{ id: "saved-1", name: "Mine", queryJson: { q: "foo" } }];
      },
      savedCreate: async (input: unknown) => {
        calls.push(["savedCreate", input]);
        return { id: "saved-2", name: "Open tasks", queryJson: { q: "open", kind: "task" } };
      },
      savedDelete: async (input: unknown) => {
        calls.push(["savedDelete", input]);
        return { ok: true };
      },
    },
    tasks: {
      create: async (input: unknown) => {
        calls.push(["tasks.create", input]);
        return { id: "task-created", title: "Created from cmdk" };
      },
    },
  };
}

async function runSearch(args: readonly string[], caller = fakeCaller()) {
  const { run } = await import("@fulcrum/cli/commands/search.ts");
  const lines: string[] = [];
  const errors: string[] = [];
  let exitCode: number | undefined;

  await run(args, {
    caller,
    print: (line) => lines.push(line),
    printErr: (line) => errors.push(line),
    exit: (code) => {
      exitCode = code;
    },
  });

  return { caller, lines, errors, exitCode };
}

async function runCmdk(args: readonly string[], caller = fakeCaller()) {
  const { runCmdk } = await import("@fulcrum/cli/commands/search.ts");
  const lines: string[] = [];
  const errors: string[] = [];
  let exitCode: number | undefined;

  await runCmdk(args, {
    caller,
    print: (line) => lines.push(line),
    printErr: (line) => errors.push(line),
    exit: (code) => {
      exitCode = code;
    },
  });

  return { caller, lines, errors, exitCode };
}

describe("search CLI commands", () => {
  it("runs search query with filters and prints JSON envelope", async () => {
    const result = await runSearch([
      "foo bar",
      "--kind",
      "task",
      "--project",
      "project-1",
      "--all-projects",
      "--status",
      "open",
      "--assignee",
      "me",
      "--tag",
      "bug",
      "--date-range",
      "2026-01-01T00:00:00Z/2026-01-31T23:59:59Z",
      "--author",
      "user-1",
      "--limit",
      "25",
      "--offset",
      "50",
      "--json",
    ]);

    expect(result.exitCode).toBeUndefined();
    expect(result.caller.calls[0]).toEqual(["query", {
      q: "foo bar",
      kind: "task",
      project: "project-1",
      scope: "all",
      status: "open",
      assignee: "me",
      tag: "bug",
      dateRange: "2026-01-01T00:00:00Z/2026-01-31T23:59:59Z",
      author: "user-1",
      limit: 25,
      offset: 50,
    }]);
    expect(JSON.parse(result.lines[0] as string)).toEqual({
      results: [{ id: "task-1", kind: "task", title: "Foo task" }],
      total: 1,
    });
  });

  it("rejects unknown kind before calling the command caller", async () => {
    const caller = fakeCaller();
    const result = await runSearch(["foo", "--kind", "unknown", "--json"], caller);

    expect(result.exitCode).toBe(1);
    expect(caller.calls).toEqual([]);
    expect(result.errors.join("\n")).toContain("unknown --kind");
  });

  it("routes search query through the configured public API", async () => {
    const { run } = await import("@fulcrum/cli/commands/search.ts");
    const lines: string[] = [];
    const errors: string[] = [];
    const calls: Array<{ url: string; method: string | undefined; authorization: string | null }> = [];

    await run(["query", "kernel", "--kind", "task", "--project", "project-1", "--limit", "5", "--json"], {
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
        FULCRUM_USER_ID: "user-1",
        FULCRUM_API_TOKEN: "token-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          method: init?.method,
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return Response.json([{ id: "hit-1", title: "Kernel" }]);
      }) as typeof fetch,
      print: (line) => lines.push(line),
      printErr: (line) => errors.push(line),
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(errors).toEqual([]);
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3210/api/v1/search?q=kernel&org_id=org-1&project_id=project-1&kind=task&limit=5",
        method: "GET",
        authorization: "Bearer token-1",
      },
    ]);
    expect(JSON.parse(lines[0] as string)).toEqual([{ id: "hit-1", title: "Kernel" }]);
  });

  it("search query requires a configured public API without injected caller", async () => {
    const { run } = await import("@fulcrum/cli/commands/search.ts");
    const errors: string[] = [];
    let exitCode: number | undefined;

    await run(["query", "kernel", "--json"], {
      env: {},
      fetch: (async () => {
        throw new Error("fetch should not run without API configuration");
      }) as unknown as typeof fetch,
      print: () => {},
      printErr: (line) => errors.push(line),
      exit: (code) => {
        exitCode = code;
      },
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("Search API caller is not configured");
  });

  it("runs suggestions and saved search commands", async () => {
    const caller = fakeCaller();

    const suggest = await runSearch(["suggest", "foo", "--kind", "task", "--json"], caller);
    const list = await runSearch(["saved", "list", "--project", "project-1", "--json"], caller);
    const create = await runSearch([
      "saved",
      "create",
      "--name",
      "Open tasks",
      "--query-json",
      "{\"q\":\"open\",\"kind\":\"task\"}",
      "--json",
    ], caller);
    const deleted = await runSearch(["saved", "delete", "saved-2", "--json"], caller);

    expect(caller.calls).toEqual([
      ["suggest", { partial: "foo", kind: "task" }],
      ["savedList", { project: "project-1" }],
      ["savedCreate", { name: "Open tasks", queryJson: { q: "open", kind: "task" } }],
      ["savedDelete", { id: "saved-2" }],
    ]);
    expect(JSON.parse(suggest.lines[0] as string).suggestions).toHaveLength(1);
    expect(JSON.parse(list.lines[0] as string)[0].id).toBe("saved-1");
    expect(JSON.parse(create.lines[0] as string).id).toBe("saved-2");
    expect(JSON.parse(deleted.lines[0] as string)).toEqual({ ok: true });
  });

  it("dispatches cmdk create-task and rejects unknown commands", async () => {
    const caller = fakeCaller();
    const created = await runCmdk([
      "create-task",
      "--args",
      "{\"title\":\"Created from cmdk\"}",
      "--json",
    ], caller);
    const unknown = await runCmdk(["unknown-cmd", "--json"], caller);

    expect(caller.calls).toEqual([
      ["tasks.create", { title: "Created from cmdk" }],
    ]);
    expect(JSON.parse(created.lines[0] as string).id).toBe("task-created");
    expect(unknown.exitCode).toBe(1);
    expect(unknown.errors.join("\n")).toContain("unknown cmdk command");
  });

  it("routes cmdk create-task through the configured task public API", async () => {
    const { runCmdk } = await import("@fulcrum/cli/commands/search.ts");
    const lines: string[] = [];
    const errors: string[] = [];
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];

    await runCmdk(["create-task", "--args", "{\"title\":\"Created from cmdk\"}", "--json"], {
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
        FULCRUM_USER_ID: "user-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          method: init?.method,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return Response.json({ id: "task-created", title: "Created from cmdk" });
      }) as typeof fetch,
      print: (line) => lines.push(line),
      printErr: (line) => errors.push(line),
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(errors).toEqual([]);
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3210/api/v1/tasks?orgId=org-1&userId=user-1",
        method: "POST",
        body: {
          title: "Created from cmdk",
          orgId: "org-1",
          userId: "user-1",
        },
      },
    ]);
    expect(JSON.parse(lines[0] as string)).toEqual({ id: "task-created", title: "Created from cmdk" });
  });

  it("--semantic with embeddings disabled returns FeatureDisabledError", async () => {
    const caller = fakeCaller();
    const result = await runSearch([
      "foo",
      "--semantic",
      "--kind",
      "task",
      "--json",
    ], caller);

    expect(result.exitCode).toBe(1);
    expect(caller.calls).toEqual([]);
    expect(result.errors.join("\n")).toContain("FeatureDisabled");
  });

  it("prints help for search and cmdk", async () => {
    const search = await runSearch(["--help"]);
    const cmdk = await runCmdk(["--help"]);

    expect(search.lines.join("\n")).toContain("fulcrum search <query>");
    expect(search.lines.join("\n")).toContain("fulcrum search saved create");
    expect(cmdk.lines.join("\n")).toContain("fulcrum cmdk <command-name>");
  });
});
