import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { run, type AuditClient } from "./audit.ts";

let tmp: string | undefined;

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function captureConsole(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  return {
    logs,
    restore: () => {
      console.log = originalLog;
    },
  };
}

function client(overrides: Partial<AuditClient>): AuditClient {
  return {
    query: async () => [],
    export: async () => ({ format: "json" as const, content: "[]" }),
    exportStatus: async () => ({ status: "completed" as const, format: "json" as const, content: "[]" }),
    ...overrides,
  };
}

describe("fulcrum audit CLI", () => {
  test("query passes filters and prints JSON array", async () => {
    const calls: unknown[] = [];
    const { logs, restore } = captureConsole();
    try {
      await run(["query", "--kind", "task", "--verb", "created", "--since", "2026-01-01", "--limit", "20", "--json"], {
        client: client({
          query: async (input) => {
            calls.push(input);
            return [{ id: "evt_1", subject_kind: "task", verb: "created" }];
          },
        }),
      });
    } finally {
      restore();
    }

    expect(calls).toEqual([{
      kind: "task",
      verb: "created",
      since: "2026-01-01T00:00:00.000Z",
      limit: 20,
    }]);
    expect(JSON.parse(logs.join(""))).toEqual([{ id: "evt_1", subject_kind: "task", verb: "created" }]);
  });

  test("query requires the configured audit public API when no test client is injected", async () => {
    await expect(run(["query", "--json"], {
      env: {},
      fetch: (async () => {
        throw new Error("unexpected fetch");
      }) as unknown as typeof fetch,
    })).rejects.toThrow("Audit API caller is not configured");
  });

  test("query uses the configured Nest audit API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const { logs, restore } = captureConsole();
    try {
      await run(["query", "--project", "project-1", "--user", "user-1", "--kind", "task", "--limit", "10", "--json"], {
        env: {
          FULCRUM_SERVER_URL: "http://127.0.0.1:3000/",
          FULCRUM_ORG_ID: "org-1",
        },
        fetch: (async (url: string | URL | Request, init?: RequestInit) => {
          calls.push({ url: String(url), init: init ?? {} });
          return Response.json({
            data: [{ id: "audit-public", subjectKind: "task", userId: "user-1" }],
            total: 1,
          });
        }) as typeof fetch,
      });
    } finally {
      restore();
    }

    expect(JSON.parse(logs.join(""))).toEqual([{ id: "audit-public", subjectKind: "task", userId: "user-1" }]);
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3000/api/v1/audit?orgId=org-1&projectId=project-1&userId=user-1&kind=task&limit=10",
        init: {
          method: "GET",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: undefined,
        },
      },
    ]);
  });

  test("query without --json prints one event per line", async () => {
    const { logs, restore } = captureConsole();
    try {
      await run(["query"], {
        client: client({
          query: async () => [{ id: "evt_1" }, { id: "evt_2" }],
        }),
      });
    } finally {
      restore();
    }
    expect(logs.length).toBe(2);
    expect(JSON.parse(logs[0] as string)).toEqual({ id: "evt_1" });
  });

  test("export --format csv --output writes CSV file", async () => {
    tmp = await mkdtemp(join(tmpdir(), "fulcrum-audit-cli-"));
    const output = join(tmp, "audit.csv");
    await run(["export", "--format", "csv", "--output", output], {
      client: client({
        export: async () => ({
          format: "csv" as const,
          content: "id,actor,subject_kind,subject_id,verb,created_at,payload\nevt_1,system,task,task_1,created,2026-01-01T00:00:00.000Z,{}\n",
        }),
      }),
    });

    const content = await readFile(output, "utf8");
    expect(content).toContain("id,actor,subject_kind,subject_id,verb,created_at,payload");
  });

  test("export --format json streams JSON to stdout", async () => {
    const { logs, restore } = captureConsole();
    try {
      await run(["export", "--format", "json"], {
        client: client({
          export: async () => ({ format: "json" as const, content: '[{"id":"evt_1"}]' }),
        }),
      });
    } finally {
      restore();
    }

    expect(JSON.parse(logs.join(""))).toEqual([{ id: "evt_1" }]);
  });

  test("export uses the configured Nest audit API for immediate JSON export", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const { logs, restore } = captureConsole();
    try {
      await run(["export", "--format", "json", "--project", "project-1", "--kind", "task"], {
        env: {
          FULCRUM_PUBLIC_API_URL: "http://127.0.0.1:4321/base/",
          FULCRUM_ORG_ID: "org-1",
        },
        fetch: (async (url: string | URL | Request, init?: RequestInit) => {
          calls.push({ url: String(url), init: init ?? {} });
          return Response.json([{ id: "audit-export", subjectKind: "task" }]);
        }) as typeof fetch,
      });
    } finally {
      restore();
    }

    expect(JSON.parse(logs.join(""))).toEqual([{ id: "audit-export", subjectKind: "task" }]);
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:4321/api/v1/audit/export?orgId=org-1&projectId=project-1&kind=task&format=json",
        init: {
          method: "GET",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: undefined,
        },
      },
    ]);
  });

  test("export polls the configured Nest audit API when it returns a job", async () => {
    tmp = await mkdtemp(join(tmpdir(), "fulcrum-audit-public-job-"));
    const output = join(tmp, "audit.json");
    const calls: Array<{ url: string; init: RequestInit }> = [];
    await run(["export", "--format", "json", "--output", output], {
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3000",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        if (String(url).includes("/api/v1/audit/export/job-public")) {
          return Response.json({
            status: "completed",
            format: "json",
            content: '[{"id":"audit-public-job"}]',
          });
        }
        return Response.json({ jobId: "job-public" });
      }) as typeof fetch,
      sleep: async () => {},
    });

    expect(JSON.parse(await readFile(output, "utf8"))).toEqual([{ id: "audit-public-job" }]);
    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:3000/api/v1/audit/export?orgId=org-1&format=json",
      "http://127.0.0.1:3000/api/v1/audit/export/job-public?orgId=org-1",
    ]);
  });

  test("export --format json --output writes to file", async () => {
    tmp = await mkdtemp(join(tmpdir(), "fulcrum-audit-cli-json-"));
    const output = join(tmp, "audit.json");
    await run(["export", "--format", "json", "--output", output], {
      client: client({
        export: async () => ({ format: "json" as const, content: '[{"id":"evt_1"}]' }),
      }),
    });
    const content = await readFile(output, "utf8");
    expect(JSON.parse(content)).toEqual([{ id: "evt_1" }]);
  });

  test("large export job polls exportStatus before writing output", async () => {
    tmp = await mkdtemp(join(tmpdir(), "fulcrum-audit-cli-job-"));
    const output = join(tmp, "audit.json");
    let polls = 0;
    await run(["export", "--format", "json", "--output", output], {
      client: client({
        export: async () => ({ jobId: "job_1" }),
        exportStatus: async (jobId) => {
          polls += 1;
          expect(jobId).toBe("job_1");
          return polls === 1
            ? { status: "running" as const }
            : { status: "completed" as const, format: "json" as const, content: '[{"id":"evt_2"}]' };
        },
      }),
      sleep: async () => {},
    });

    expect(polls).toBe(2);
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual([{ id: "evt_2" }]);
  });

  test("--since and --until parse ISO dates", async () => {
    const calls: unknown[] = [];
    const { logs, restore } = captureConsole();
    try {
      await run(["query", "--since", "2026-01-01", "--until", "2026-12-31", "--json"], {
        client: client({
          query: async (input) => { calls.push(input); return []; },
        }),
      });
    } finally {
      restore();
    }
    const input = calls[0] as Record<string, unknown>;
    expect(input.since).toBe("2026-01-01T00:00:00.000Z");
    expect(input.until).toBe("2026-12-31T00:00:00.000Z");
  });

  test("--help prints usage with compliance export info", async () => {
    const { logs, restore } = captureConsole();
    try {
      await run(["--help"]);
    } finally {
      restore();
    }
    const output = logs.join("\n");
    expect(output).toContain("fulcrum audit");
    expect(output).toContain("compliance");
    expect(output).toContain("--format csv|json");
  });

  test("export rejects missing --format", async () => {
    try {
      await run(["export"], { client: client({}) });
      expect(true).toBe(false); // should not reach
    } catch (e: unknown) {
      expect((e as Error).message).toContain("--format must be csv or json");
    }
  });
});
