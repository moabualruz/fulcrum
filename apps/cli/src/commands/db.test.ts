import { afterEach, describe, expect, test } from "bun:test";

import { run } from "./db.ts";

let lines: string[] = [];
const originalLog = console.log;

afterEach(() => {
  console.log = originalLog;
  lines = [];
});

describe("fulcrum db local reset UX", () => {
  test("reset-local-state reports explicit target and confirmation gate as JSON", async () => {
    console.log = (line?: unknown) => {
      lines.push(String(line));
    };

    await run([
      "reset-local-state",
      "--fulcrum-home",
      "/tmp/fulcrum-home",
      "--json",
    ]);

    expect(JSON.parse(lines[0]!)).toMatchObject({
      status: "reset-required",
      fulcrumHome: "/tmp/fulcrum-home",
      canExecute: false,
      requiredFlag: "--yes-reset-local-state",
    });
  });
});
