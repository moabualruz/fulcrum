import { describe, expect, test } from "bun:test";
import type { ContextRunOptions } from "@fulcrum/cli/commands/context.ts";

interface ContextBundle {
  memories: unknown[];
  docs: unknown[];
  transcripts: unknown[];
  repoState: Record<string, unknown>;
  tokenCount: number;
}

function fakeCaller() {
  const calls: unknown[] = [];
  return {
    calls,
    context: {
      assemble: async (input: unknown) => {
        calls.push(["assemble", input]);
        return {
          memories: [{ id: "m1", body: "Remember X" }],
          docs: [{ id: "d1", title: "ADR" }],
          transcripts: [{ id: "t1", summary: "Session 1" }],
          repoState: { branch: "main", dirty: false },
          tokenCount: 4200,
        } satisfies ContextBundle;
      },
    },
  };
}

async function runContext(args: readonly string[], caller = fakeCaller()) {
  return {
    caller,
    ...await runContextWithOptions(args, { caller }),
  };
}

async function runContextWithOptions(
  args: readonly string[],
  options: ContextRunOptions = {},
) {
  const { run } = await import("@fulcrum/cli/commands/context.ts");
  const lines: string[] = [];
  const errors: string[] = [];
  let exitCode: number | undefined;

  await run(args, {
    ...options,
    print: (line) => lines.push(line),
    printErr: (line) => errors.push(line),
    exit: (code) => {
      exitCode = code;
    },
  });

  return { lines, errors, exitCode };
}

describe("context CLI commands", () => {
  test("assemble --task T prints context bundle with tokenCount", async () => {
    const result = await runContext([
      "assemble",
      "--task",
      "Implement feature X",
      "--json",
    ]);

    expect(result.exitCode).toBeUndefined();
    expect(result.caller.calls).toEqual([
      ["assemble", { task: "Implement feature X" }],
    ]);
    const bundle = JSON.parse(result.lines[0] as string) as ContextBundle;
    expect(bundle.memories).toHaveLength(1);
    expect(bundle.docs).toHaveLength(1);
    expect(bundle.transcripts).toHaveLength(1);
    expect(bundle.repoState).toEqual({ branch: "main", dirty: false });
    expect(bundle.tokenCount).toBe(4200);
  });

  test("assemble without --task exits with error", async () => {
    const result = await runContext(["assemble", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.errors.join("\n")).toContain("--task");
  });

  test("prints help", async () => {
    const result = await runContext(["--help"]);
    expect(result.lines.join("\n")).toContain("fulcrum context assemble");
  });

  test("routes assemble and preview through the context public API", async () => {
    const requests: Array<[string, string]> = [];
    const fetchFn = (async (input, init) => {
      requests.push([init?.method ?? "GET", String(input)]);
      return Response.json({
        taskId: new URL(String(input)).searchParams.get("taskId"),
        slices: ["docs", "memory"],
      });
    }) as typeof fetch;
    const options: ContextRunOptions = {
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210",
        FULCRUM_API_TOKEN: "token-1",
      },
      fetch: fetchFn,
    };

    const assemble = await runContextWithOptions([
      "assemble",
      "--task",
      "task-1",
      "--json",
    ], options);
    const preview = await runContextWithOptions([
      "preview",
      "--project",
      "project-1",
      "--task",
      "task-2",
      "--include-global",
      "--json",
    ], options);

    expect(assemble.exitCode).toBeUndefined();
    expect(preview.exitCode).toBeUndefined();
    expect(JSON.parse(assemble.lines[0] as string)).toEqual({ taskId: "task-1", slices: ["docs", "memory"] });
    expect(JSON.parse(preview.lines[0] as string)).toEqual({ taskId: "task-2", slices: ["docs", "memory"] });
    expect(requests).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/context/preview?taskId=task-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/context/preview?taskId=task-2&includeGlobal=true"],
    ]);
  });

  test("requires the context public API when no caller is injected", async () => {
    const result = await runContextWithOptions(["assemble", "--task", "task-1", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.lines).toEqual([]);
    expect(result.errors.join("\n")).toContain("Context API caller is not configured");
  });
});
