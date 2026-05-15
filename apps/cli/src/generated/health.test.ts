import { afterEach, describe, expect, test } from "bun:test";

import { createHealthCommand } from "./health.ts";

const originalLog = console.log;

afterEach(() => {
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated health commands", () => {
  test("ping reports local process health without tRPC", async () => {
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };

    await createHealthCommand().parseAsync(["ping", "--json"], { from: "user" });

    const payload = JSON.parse(output.join("\n")) as { ok?: boolean; timestamp?: string };
    expect(payload.ok).toBe(true);
    expect(typeof payload.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(payload.timestamp ?? ""))).toBe(false);
  });
});
