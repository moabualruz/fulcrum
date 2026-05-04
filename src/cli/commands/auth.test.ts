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
            email: "admin@local",
            role: "owner",
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
      email: "admin@local",
      role: "owner",
    });
  });

  test("missing CLI session prints clear init/login next step", async () => {
    const { run } = await import("./auth.ts");
    const errors: string[] = [];
    let exitCode: number | undefined;

    await run(["whoami", "--json"], {
      container: null,
      print: () => undefined,
      printErr: (line) => errors.push(line),
      exit: (code) => {
        exitCode = code;
      },
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain(
      "No active CLI session found. Run fulcrum init or fulcrum auth login before protected auth commands.",
    );
  });
});
