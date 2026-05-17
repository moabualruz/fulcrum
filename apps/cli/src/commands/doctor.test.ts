import { describe, expect, test } from "bun:test";

import { run } from "./doctor.ts";

async function captureDoctorRun(argv: readonly string[], opts: Parameters<typeof run>[1] = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exits: number[] = [];

  await run(argv, {
    ...opts,
    print: (line) => stdout.push(line),
    printErr: (line) => stderr.push(line),
    exit: (code) => exits.push(code),
  });

  return { stdout, stderr, exits };
}

describe("doctor command boundary", () => {
  test("run and subsystems route through the configured public API", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" });
      if (String(url).endsWith("/api/v1/doctor/subsystems")) {
        return Response.json(["api", "cli"]);
      }
      return Response.json({ version: "1.0.0", checks: [], summary: { total: 0 } });
    }) as typeof fetch;
    const env = { FULCRUM_SERVER_URL: "http://127.0.0.1:3210/" };

    const report = await captureDoctorRun(["run", "--json"], { env, fetch: fetchFn });
    const subsystems = await captureDoctorRun(["subsystems", "--json"], { env, fetch: fetchFn });
    const payload = JSON.parse(report.stdout.join("\n")) as { version?: string };

    expect(report.stderr).toEqual([]);
    expect(report.exits).toEqual([]);
    expect(subsystems.stderr).toEqual([]);
    expect(subsystems.exits).toEqual([]);
    expect(payload.version).toBe("1.0.0");
    expect(JSON.parse(subsystems.stdout.join("\n"))).toEqual(["api", "cli"]);
    expect(calls).toEqual([
      { method: "GET", url: "http://127.0.0.1:3210/api/v1/doctor" },
      { method: "GET", url: "http://127.0.0.1:3210/api/v1/doctor/subsystems" },
    ]);
  });

  test("still accepts an injected caller for focused command tests", async () => {
    const result = await captureDoctorRun(["run", "--json"], {
      caller: {
        doctor: {
          run: async () => ({ ok: true }),
          subsystems: async () => ["api"],
        },
      },
    });

    expect(JSON.parse(result.stdout[0]!)).toEqual({ ok: true });
  });

  test("requires a configured public API without injected caller", async () => {
    const result = await captureDoctorRun(["run", "--json"]);

    expect(result.stdout).toEqual([]);
    expect(result.exits).toEqual([1]);
    expect(result.stderr.join("\n")).toContain("Doctor API caller is not configured");
  });
});
