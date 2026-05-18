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
});
