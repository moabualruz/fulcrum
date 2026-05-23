import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "bun:test";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const ROOT_ENTRYPOINT = join(REPO_ROOT, "apps", "cli", "src", "main.ts");

interface WhoamiResult {
  userId: string;
  orgId: string;
  activeOrgId?: string;
  sessionId?: string | null;
  sessionExpiresAt?: string | null;
  email: string | null;
  role: string | null;
  orgName?: string;
}

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
        activeOrgId: "org-01",
        sessionId: "session-01",
        sessionExpiresAt: "2026-05-18T00:00:00.000Z",
        email: "admin@local",
        role: "owner",
        orgName: "Local",
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
        throw { kind: "unauthorized", message: "Not authenticated." };
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

describe("auth.run: whoami --json", () => {
  it("prints JSON with userId, orgId, email, role and exits 0", async () => {
    const { run } = await import("@fulcrum/cli/commands/auth.ts");

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
    expect(parsed.activeOrgId).toBe("org-01");
    expect(parsed.sessionId).toBe("session-01");
    expect(parsed.sessionExpiresAt).toBe("2026-05-18T00:00:00.000Z");
    expect(parsed.email).toBe("admin@local");
    expect(parsed.role).toBe("owner");
    expect(parsed.orgName).toBe("Local");
  });

  it("prints human-readable text when --json not passed", async () => {
    const { run } = await import("@fulcrum/cli/commands/auth.ts");

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
    const { run } = await import("@fulcrum/cli/commands/auth.ts");

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

  it("routes whoami and invite through the auth public API", async () => {
    const { run } = await import("@fulcrum/cli/commands/auth.ts");
    const calls: Array<[string, string, unknown?]> = [];
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push([method, url, body]);
      if (url.includes("/invite")) {
        return Response.json({ invitationId: "inv-public", token: "token-public" });
      }
      return Response.json({
        userId: "user-public",
        orgId: "org-public",
        email: "admin@public",
        role: "owner",
      });
    }) as unknown as typeof globalThis.fetch;
    const lines: string[] = [];
    const env = {
      FULCRUM_SERVER_URL: "http://127.0.0.1:3210",
      FULCRUM_ORG_ID: "org-1",
      FULCRUM_USER_ID: "user-1",
    };

    await run(["whoami", "--json"], {
      env,
      fetch,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });
    await run(["invite", "new@test.local", "--role", "member", "--json"], {
      env,
      fetch,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    expect(JSON.parse(lines[0] as string)).toEqual({
      userId: "user-public",
      orgId: "org-public",
      email: "admin@public",
      role: "owner",
    });
    expect(JSON.parse(lines[1] as string)).toEqual({ invitationId: "inv-public", token: "token-public" });
    expect(calls).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/auth/whoami?orgId=org-1&userId=user-1", undefined],
      ["POST", "http://127.0.0.1:3210/api/v1/auth/invite", {
        orgId: "org-1",
        userId: "user-1",
        email: "new@test.local",
        role: "member",
      }],
    ]);
  });
});

describe("root entrypoint: auth", () => {
  it("lists auth in root help", async () => {
    await withFulcrumHome(async (home) => {
      const result = await runFulcrum(["help"], home);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("fulcrum auth <whoami|invite|login|logout>");
    });
  });

  it("whoami through apps/cli/src/main.ts fails at the public API config boundary without a fake caller", async () => {
    await withFulcrumHome(async (home) => {
      const result = await runFulcrum(["auth", "whoami", "--json"], home);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Auth API caller is not configured");
    });
  });

  it("fails clearly when the auth public API is not configured", async () => {
    await withFulcrumHome(async (home) => {
      const result = await runFulcrum(["auth", "whoami", "--json"], home);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Auth API caller is not configured");
    });
  });

  it("invite through apps/cli/src/main.ts fails at the public API config boundary without a fake caller", async () => {
    await withFulcrumHome(async (home) => {
      const result = await runFulcrum([
        "auth",
        "invite",
        "new@test.local",
        "--role",
        "member",
        "--json",
      ], home);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Auth API caller is not configured");
    });
  }, 15_000);
});

describe("auth.run: invite", () => {
  it("invite creates an invitation and prints JSON", async () => {
    const { run } = await import("@fulcrum/cli/commands/auth.ts");

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

describe("auth.run: login / logout not implemented", () => {
  it("login --non-interactive exits 1", async () => {
    const { run } = await import("@fulcrum/cli/commands/auth.ts");

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
    const { run } = await import("@fulcrum/cli/commands/auth.ts");

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
