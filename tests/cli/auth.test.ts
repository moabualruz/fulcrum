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
 *   4. `fulcrum auth invite <email> --role member --json` calls auth.invite.
 *   5. Unimplemented login/logout exit non-zero.
 *
 * These tests call run() from src/cli/commands/auth.ts directly, passing a
 * pre-built container/caller so no DB connection is needed.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "bun:test";
import type { Container } from "@needle-di/core";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const ROOT_ENTRYPOINT = join(REPO_ROOT, "src", "index.ts");

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
function fakeAuthenticatedCaller(): {
  auth: {
    whoami: () => Promise<WhoamiResult>;
    invite: (input: { email: string; role: string }) => Promise<{ invitationId: string; token: string }>;
  };
} {
  return {
    auth: {
      whoami: async () => ({
        userId: "user-01",
        orgId: "org-01",
        email: "admin@local",
        role: "owner",
      }),
      invite: async (input) => ({
        invitationId: `inv-${input.role}`,
        token: `token-for-${input.email}`,
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

async function withFulcrumHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "fulcrum-auth-cli-"));
  try {
    return await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function runFulcrum(args: readonly string[], fulcrumHome: string) {
  const proc = Bun.spawn([process.execPath, "run", ROOT_ENTRYPOINT, ...args], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      FULCRUM_HOME: fulcrumHome,
      NO_COLOR: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
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

describe("root entrypoint — auth", () => {
  it("lists auth in root help", async () => {
    await withFulcrumHome(async (home) => {
      const result = await runFulcrum(["help"], home);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("fulcrum auth <whoami|invite|login|logout>");
    });
  });

  it("runs whoami through src/index.ts without a fake caller", async () => {
    await withFulcrumHome(async (home) => {
      const init = await runFulcrum(["init"], home);
      expect(init.exitCode).toBe(0);

      const result = await runFulcrum(["auth", "whoami", "--json"], home);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      const parsed = JSON.parse(result.stdout);
      expect(parsed.email).toBe("admin@local");
      expect(parsed.orgId).toBe("00000000-0000-0000-0000-000000000001");
      expect(parsed.role).toBe("owner");
      expect(typeof parsed.userId).toBe("string");
    });
  });

  it("fails clearly when no CLI session exists", async () => {
    await withFulcrumHome(async (home) => {
      const result = await runFulcrum(["auth", "whoami", "--json"], home);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("No active CLI session found");
      expect(result.stderr).toContain("fulcrum init");
    });
  });

  it("runs invite through src/index.ts without a fake caller", async () => {
    await withFulcrumHome(async (home) => {
      const init = await runFulcrum(["init"], home);
      expect(init.exitCode).toBe(0);

      const result = await runFulcrum([
        "auth",
        "invite",
        "new@test.local",
        "--role",
        "member",
        "--json",
      ], home);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      const parsed = JSON.parse(result.stdout);
      expect(typeof parsed.invitationId).toBe("string");
      expect(parsed.invitationId.length).toBeGreaterThan(0);
      expect(typeof parsed.token).toBe("string");
      expect(parsed.token).toHaveLength(64);
    });
  });
});

describe("auth.run — invite", () => {
  it("invite creates an invitation and prints JSON", async () => {
    const { run } = await import("../../src/cli/commands/auth.ts");

    let exitCode: number | undefined;
    const lines: string[] = [];

    await run(["invite", "new@test.local", "--role", "member", "--json"], {
      caller: fakeAuthenticatedCaller(),
      print: (line: string) => { lines.push(line); },
      printErr: (_line: string) => {},
      exit: (code: number) => { exitCode = code; },
    });

    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(lines[0] as string);
    expect(parsed.invitationId).toBe("inv-member");
    expect(parsed.token).toBe("token-for-new@test.local");
  });
});

describe("auth.run — login / logout not implemented", () => {
  it("login --non-interactive exits 1", async () => {
    const { run } = await import("../../src/cli/commands/auth.ts");

    let exitCode: number | undefined;
    const errLines: string[] = [];

    await run(["login", "--non-interactive"], {
      caller: fakeAuthenticatedCaller(),
      print: (_line: string) => {},
      printErr: (line: string) => { errLines.push(line); },
      exit: (code: number) => { exitCode = code; },
    });

    expect(exitCode).toBe(1);
    expect(errLines.join("\n")).toMatch(/not yet implemented/i);
  });

  it("logout exits 1", async () => {
    const { run } = await import("../../src/cli/commands/auth.ts");

    let exitCode: number | undefined;
    const errLines: string[] = [];

    await run(["logout"], {
      caller: fakeAuthenticatedCaller(),
      print: (_line: string) => {},
      printErr: (line: string) => { errLines.push(line); },
      exit: (code: number) => { exitCode = code; },
    });

    expect(exitCode).toBe(1);
    expect(errLines.join("\n")).toMatch(/not yet implemented/i);
  });
});
