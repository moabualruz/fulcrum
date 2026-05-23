import { describe, expect, test } from "bun:test";

describe("auth whoami parity", () => {
  test("prints stable JSON contract from auth.whoami", async () => {
    const { run } = await import("./auth.ts");
    const lines: string[] = [];

    await run(["whoami", "--json"], {
      caller: {
        auth: {
          whoami: async () => ({
            userId: "user_01",
            orgId: "org_01",
            activeOrgId: "org_01",
            sessionId: "session_01",
            sessionExpiresAt: "2026-05-18T00:00:00.000Z",
            email: "admin@local",
            role: "owner",
            orgName: "Local",
          }),
        },
      },
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });

    expect(JSON.parse(lines[0] ?? "{}")).toEqual({
      userId: "user_01",
      orgId: "org_01",
      activeOrgId: "org_01",
      sessionId: "session_01",
      sessionExpiresAt: "2026-05-18T00:00:00.000Z",
      email: "admin@local",
      role: "owner",
      orgName: "Local",
    });
  });

  test("missing public API config prints clear next step", async () => {
    const { run } = await import("./auth.ts");
    const errors: string[] = [];
    let exitCode: number | undefined;

    await run(["whoami", "--json"], {
      print: () => undefined,
      printErr: (line) => errors.push(line),
      exit: (code) => {
        exitCode = code;
      },
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain(
      "Auth API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.",
    );
  });

  test("lists and revokes managed sessions through auth caller", async () => {
    const { run } = await import("./auth.ts");
    const lines: string[] = [];
    const calls: unknown[] = [];
    const caller = {
      auth: {
        whoami: async () => ({ userId: "user_01", orgId: "org_01", email: "admin@local", role: "owner" }),
        sessions: async (input?: Record<string, unknown>) => {
          calls.push(["sessions", input]);
          return [{
            id: "session_remote",
            deviceType: "desktop",
            browser: "Firefox",
            ipAddress: "203.0.113.0",
            lastActiveAt: "2026-05-18T12:00:00.000Z",
            isCurrent: false,
          }];
        },
        revokeSession: async (input: { sessionId: string; currentSessionId?: string }) => {
          calls.push(["revoke", input]);
          return { revokedSessionIds: [input.sessionId] };
        },
        revokeOtherSessions: async (input?: { currentSessionId?: string }) => {
          calls.push(["revokeOthers", input]);
          return { revokedSessionIds: ["session_remote"] };
        },
      },
    };

    await run(["sessions", "--current", "session_current", "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });
    await run(["revoke-session", "session_remote", "--current", "session_current", "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });
    await run(["revoke-other-sessions", "--current", "session_current", "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });

    expect(JSON.parse(lines[0] ?? "[]")[0]).toMatchObject({ id: "session_remote", ipAddress: "203.0.113.0" });
    expect(JSON.parse(lines[1] ?? "{}")).toEqual({ revokedSessionIds: ["session_remote"] });
    expect(JSON.parse(lines[2] ?? "{}")).toEqual({ revokedSessionIds: ["session_remote"] });
    expect(calls).toEqual([
      ["sessions", { currentSessionId: "session_current" }],
      ["revoke", { sessionId: "session_remote", currentSessionId: "session_current" }],
      ["revokeOthers", { currentSessionId: "session_current" }],
    ]);
  });
});
