/**
 * CLI auth command tests — TDD RED → GREEN.
 *
 * Tests run the CLI entrypoint in-process (via run() import) rather than
 * spawning a subprocess, so they don't need a compiled binary and are fast.
 *
 * Acceptance criteria (issue #10):
 *   1. `fulcrum auth whoami --json` returns { userId, orgId, email, role } JSON.
 *   2. `fulcrum auth whoami` (no --json) prints human-readable text.
 *   3. `fulcrum auth whoami` without session exits non-zero with error on stderr.
 *   4. `fulcrum auth login --non-interactive` exits 0 (stub: not yet implemented).
 *   5. `fulcrum auth logout` exits 0 (stub: not yet implemented).
 *
 * These tests call run() from src/cli/commands/auth.ts directly, passing a
 * pre-built container/caller so no DB connection is needed.
 */

import { describe, it, expect } from "bun:test";
import type { Container } from "@needle-di/core";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — build a fake in-process tRPC caller
// ─────────────────────────────────────────────────────────────────────────────

interface WhoamiResult {
  userId: string;
  orgId: string;
  email: string | null;
  role: string | null;
}

/**
 * Build a minimal fake caller that mimics the shape of a tRPC caller.
 * run() in auth.ts accepts a `caller` option (or builds one from container).
 */
function fakeAuthenticatedCaller(): { auth: { whoami: () => Promise<WhoamiResult> } } {
  return {
    auth: {
      whoami: async () => ({
        userId: "user-01",
        orgId: "org-01",
        email: "admin@local",
        role: "owner",
      }),
    },
  };
}

function fakeUnauthCaller(): { auth: { whoami: () => Promise<WhoamiResult> } } {
  return {
    auth: {
      whoami: async () => {
        const { TRPCError } = await import("@trpc/server");
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated." });
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("auth.run — whoami --json", () => {
  it("prints JSON with userId, orgId, email, role and exits 0", async () => {
    const { run } = await import("../../src/cli/commands/auth.ts");

    const lines: string[] = [];
    let exitCode: number | undefined;

    await run(["whoami", "--json"], {
      caller: fakeAuthenticatedCaller(),
      print: (line: string) => { lines.push(line); },
      printErr: (_line: string) => {},
      exit: (code: number) => { exitCode = code; },
    });

    expect(exitCode).toBeUndefined(); // no exit() called → success
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] as string);
    expect(parsed.userId).toBe("user-01");
    expect(parsed.orgId).toBe("org-01");
    expect(parsed.email).toBe("admin@local");
    expect(parsed.role).toBe("owner");
  });

  it("prints human-readable text when --json not passed", async () => {
    const { run } = await import("../../src/cli/commands/auth.ts");

    const lines: string[] = [];

    await run(["whoami"], {
      caller: fakeAuthenticatedCaller(),
      print: (line: string) => { lines.push(line); },
      printErr: (_line: string) => {},
      exit: (_code: number) => {},
    });

    const output = lines.join("\n");
    expect(output).toContain("admin@local");
    expect(output).toContain("org-01");
  });

  it("calls exit(1) and prints to stderr on UNAUTHORIZED", async () => {
    const { run } = await import("../../src/cli/commands/auth.ts");

    const errLines: string[] = [];
    let exitCode: number | undefined;

    await run(["whoami"], {
      caller: fakeUnauthCaller(),
      print: (_line: string) => {},
      printErr: (line: string) => { errLines.push(line); },
      exit: (code: number) => { exitCode = code; },
    });

    expect(exitCode).toBe(1);
    expect(errLines.join("\n")).toMatch(/unauthorized|authentication/i);
  });
});

describe("auth.run — login / logout stubs", () => {
  it("login --non-interactive exits 0", async () => {
    const { run } = await import("../../src/cli/commands/auth.ts");

    let exitCode: number | undefined;
    const lines: string[] = [];

    await run(["login", "--non-interactive"], {
      caller: fakeAuthenticatedCaller(),
      print: (line: string) => { lines.push(line); },
      printErr: (_line: string) => {},
      exit: (code: number) => { exitCode = code; },
    });

    expect(exitCode).toBeUndefined(); // no error
    expect(lines.join("")).toBeTruthy(); // at minimum prints something
  });

  it("logout exits 0", async () => {
    const { run } = await import("../../src/cli/commands/auth.ts");

    let exitCode: number | undefined;
    const lines: string[] = [];

    await run(["logout"], {
      caller: fakeAuthenticatedCaller(),
      print: (line: string) => { lines.push(line); },
      printErr: (_line: string) => {},
      exit: (code: number) => { exitCode = code; },
    });

    expect(exitCode).toBeUndefined();
    expect(lines.join("")).toBeTruthy();
  });
});
