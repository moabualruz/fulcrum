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
