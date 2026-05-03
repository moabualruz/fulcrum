import { describe, expect, test } from "bun:test";
import { checks } from "./cli.ts";
import { runChecks } from "../runner.ts";

describe("CLI doctor checks module", () => {
  test("exports 6 checks", () => {
    expect(checks).toHaveLength(6);
  });

  test("all checks have subsystem=cli", () => {
    for (const check of checks) {
      expect(check.subsystem).toBe("cli");
    }
  });

  test("all check names are unique", () => {
    const names = checks.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("all 6 checks pass on clean build", async () => {
    const results = await runChecks(checks);
    expect(results).toHaveLength(6);
    for (const result of results) {
      expect(result.status).not.toBe("fail");
    }
  });

  test("each check result has required fields", async () => {
    const results = await runChecks(checks);
    for (const result of results) {
      expect(typeof result.name).toBe("string");
      expect(typeof result.subsystem).toBe("string");
      expect(typeof result.message).toBe("string");
      expect(typeof result.durationMs).toBe("number");
      expect(["ok", "warn", "fail"]).toContain(result.status);
    }
  });
});
