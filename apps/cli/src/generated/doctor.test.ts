import { afterEach, describe, expect, test } from "bun:test";

import { createDoctorCommand } from "./doctor.ts";

const originalLog = console.log;

afterEach(() => {
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated doctor commands", () => {
  test("run emits the application doctor report without tRPC", async () => {
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };

    await createDoctorCommand().parseAsync(["run", "--json"], { from: "user" });

    const payload = JSON.parse(output.join("\n")) as {
      version?: string;
      checks?: unknown[];
      summary?: { total?: number };
    };
    expect(payload.version).toBe("1.0.0");
    expect(Array.isArray(payload.checks)).toBe(true);
    expect(payload.summary?.total).toBe(payload.checks?.length);
  });

  test("subsystems lists discovered doctor subsystems without tRPC", async () => {
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };

    await createDoctorCommand().parseAsync(["subsystems", "--json"], { from: "user" });

    const payload = JSON.parse(output.join("\n")) as string[];
    expect(payload).toContain("cli");
    expect([...payload].sort()).toEqual(payload);
  });
});
