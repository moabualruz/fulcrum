import { describe, expect, test } from "bun:test";

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
  const { run } = await import("../../src/cli/commands/context.ts");
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
});
