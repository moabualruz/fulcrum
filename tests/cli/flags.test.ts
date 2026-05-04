/**
 * CLI flags command tests — TDD RED → GREEN.
 *
 * Tests run the CLI handler in-process (no subprocess, no DB needed).
 *
 * Acceptance criteria (issue #10):
 *   1. `fulcrum flags list --json` returns array of { name, enabled, description }.
 *   2. `fulcrum flags list` (no --json) prints a human-readable table.
 *   3. `fulcrum flags set router-llm on` prints confirmation and exits 0.
 *   4. `fulcrum flags set router-llm off` prints confirmation and exits 0.
 *   5. `fulcrum flags set <unknown-flag> on` exits non-zero with error.
 */

import { describe, it, expect } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// Fake callers
// ─────────────────────────────────────────────────────────────────────────────

interface FlagItem {
  name: string;
  enabled: boolean;
  description: string;
}

interface SetResult {
  ok: boolean;
}

const FAKE_FLAGS: FlagItem[] = [
  { name: "router-llm", enabled: false, description: "Enable the LLM-based task router." },
  { name: "embeddings", enabled: true, description: "Enable vector embeddings." },
];

function fakeFlagsCaller(flags: FlagItem[] = FAKE_FLAGS): {
  flags: {
    list: () => Promise<FlagItem[]>;
    set: (input: { flag: string; enabled: boolean }) => Promise<SetResult>;
  };
} {
  let state = [...flags];
  return {
    flags: {
      list: async () => [...state],
      set: async (input: { flag: string; enabled: boolean }) => {
        state = state.map((f) =>
          f.name === input.flag ? { ...f, enabled: input.enabled } : f,
        );
        return { ok: true };
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("flags.run — list --json", () => {
  it("prints JSON array with name, enabled, description", async () => {
    const { run } = await import("../../src/cli/commands/flags.ts");

    const lines: string[] = [];
    let exitCode: number | undefined;

    await run(["list", "--json"], {
      caller: fakeFlagsCaller(),
      print: (line: string) => { lines.push(line); },
      printErr: (_line: string) => {},
      exit: (code: number) => { exitCode = code; },
    });

    expect(exitCode).toBeUndefined();
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] as string) as FlagItem[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    for (const item of parsed) {
      expect(typeof item.name).toBe("string");
      expect(typeof item.enabled).toBe("boolean");
      expect(typeof item.description).toBe("string");
    }
  });

  it("prints human-readable table when --json not passed", async () => {
    const { run } = await import("../../src/cli/commands/flags.ts");

    const lines: string[] = [];

    await run(["list"], {
      caller: fakeFlagsCaller(),
      print: (line: string) => { lines.push(line); },
      printErr: (_line: string) => {},
      exit: (_code: number) => {},
    });

    const output = lines.join("\n");
    expect(output).toContain("router-llm");
    expect(output).toContain("embeddings");
  });
});

describe("flags.run — set", () => {
  it("set router-llm on exits 0 and prints confirmation", async () => {
    const { run } = await import("../../src/cli/commands/flags.ts");

    const lines: string[] = [];
    let exitCode: number | undefined;

    await run(["set", "router-llm", "on"], {
      caller: fakeFlagsCaller(),
      print: (line: string) => { lines.push(line); },
      printErr: (_line: string) => {},
      exit: (code: number) => { exitCode = code; },
    });

    expect(exitCode).toBeUndefined();
    const output = lines.join("\n");
    expect(output).toMatch(/router-llm/);
  });

  it("set embeddings off exits 0 and prints confirmation", async () => {
    const { run } = await import("../../src/cli/commands/flags.ts");

    const lines: string[] = [];
    let exitCode: number | undefined;

    await run(["set", "embeddings", "off"], {
      caller: fakeFlagsCaller(),
      print: (line: string) => { lines.push(line); },
      printErr: (_line: string) => {},
      exit: (code: number) => { exitCode = code; },
    });

    expect(exitCode).toBeUndefined();
    const output = lines.join("\n");
    expect(output).toMatch(/embeddings/);
  });

  it("set with missing value argument exits 1 with error", async () => {
    const { run } = await import("../../src/cli/commands/flags.ts");

    const errLines: string[] = [];
    let exitCode: number | undefined;

    await run(["set", "router-llm"], {
      caller: fakeFlagsCaller(),
      print: (_line: string) => {},
      printErr: (line: string) => { errLines.push(line); },
      exit: (code: number) => { exitCode = code; },
    });

    expect(exitCode).toBe(1);
    expect(errLines.join("")).toBeTruthy();
  });

  it("set with invalid on/off value exits 1 with error", async () => {
    const { run } = await import("../../src/cli/commands/flags.ts");

    const errLines: string[] = [];
    let exitCode: number | undefined;

    await run(["set", "router-llm", "maybe"], {
      caller: fakeFlagsCaller(),
      print: (_line: string) => {},
      printErr: (line: string) => { errLines.push(line); },
      exit: (code: number) => { exitCode = code; },
    });

    expect(exitCode).toBe(1);
    expect(errLines.join("")).toBeTruthy();
  });
});
