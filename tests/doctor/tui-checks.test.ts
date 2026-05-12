import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checks } from "../../src/doctor/checks/tui.ts";

const realHome = process.env["FULCRUM_HOME"];

function check(name: string) {
  const found = checks.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`missing check ${name}`);
  return found;
}

async function withFulcrumHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "fulcrum-tui-doctor-"));
  process.env["FULCRUM_HOME"] = home;
  try {
    return await fn(home);
  } finally {
    if (realHome === undefined) delete process.env["FULCRUM_HOME"];
    else process.env["FULCRUM_HOME"] = realHome;
    await rm(home, { recursive: true, force: true });
  }
}

afterEach(() => {
  if (realHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = realHome;
});

describe("TUI doctor checks", () => {
  test("exports seven TUI subsystem checks with stable names", () => {
    expect(checks.map((candidate) => candidate.name)).toEqual([
      "tui.binary-tui-entrypoint",
      "tui.opentui-version",
      "tui.render-p95-ms",
      "tui.keybind-conflicts",
      "tui.trpc-warmup",
      "tui.subscription-bridge",
      "tui.wcwidth-cjk",
    ]);
    expect(checks.every((candidate) => candidate.subsystem === "tui")).toBe(true);
  });

  test("binary entrypoint check passes against the source TUI entrypoint", async () => {
    const result = await check("tui.binary-tui-entrypoint").run();

    expect(result.status).toBe("ok");
    expect(result.message).toContain("apps/tui/src/index.ts");
  });

  test("opentui version check reports the current renderer dependency posture", async () => {
    const result = await check("tui.opentui-version").run();

    expect(["ok", "warn"]).toContain(result.status);
    expect(result.message).toMatch(/opentui|open-tui|tuicss|built-in renderer/i);
  });

  test("render p95 check skips cleanly when telemetry file has no render data", async () => {
    await withFulcrumHome(async () => {
      const result = await check("tui.render-p95-ms").run();

      expect(result.status).toBe("ok");
      expect(result.message).toContain("No local_telemetry data found");
    });
  });

  test("render p95 check ignores malformed and old rows, then returns ok/warn/fail by threshold", async () => {
    await withFulcrumHome(async (home) => {
      const path = join(home, "tui-telemetry.jsonl");
      const now = new Date().toISOString();
      const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

      await writeFile(path, [
        "{not json",
        JSON.stringify({ kind: "other", render_ms: 999, occurredAt: now }),
        JSON.stringify({ kind: "local_telemetry", render_ms: 999, occurredAt: old }),
        JSON.stringify({ kind: "local_telemetry", render_ms: 10, occurredAt: now }),
        JSON.stringify({ kind: "local_telemetry", render_ms: 20, occurredAt: now }),
        "",
      ].join("\n"));
      const ok = await check("tui.render-p95-ms").run();
      expect(ok.status).toBe("ok");
      expect(ok.message).toContain("p95 render time");

      await writeFile(path, [
        JSON.stringify({ kind: "local_telemetry", render_ms: 50, occurredAt: now }),
        JSON.stringify({ kind: "local_telemetry", render_ms: 200, occurredAt: now }),
        "",
      ].join("\n"));
      const warn = await check("tui.render-p95-ms").run();
      expect(warn.status).toBe("warn");
      expect(warn.recovery).toContain("Profile TUI renders");

      await writeFile(path, [
        JSON.stringify({ kind: "local_telemetry", render_ms: 201, occurredAt: now }),
        JSON.stringify({ kind: "local_telemetry", render_ms: 250, occurredAt: now }),
        "",
      ].join("\n"));
      const fail = await check("tui.render-p95-ms").run();
      expect(fail.status).toBe("fail");
      expect(fail.message).toContain(">200ms");
    });
  });

  test("render p95 check reports malformed telemetry file read failures as warnings", async () => {
    await withFulcrumHome(async (home) => {
      const telePath = join(home, "tui-telemetry.jsonl");
      await mkdir(telePath);

      const result = await check("tui.render-p95-ms").run();

      expect(result.status).toBe("warn");
      expect(result.message).toContain("Cannot parse telemetry file");
      expect(result.recovery).toContain(telePath);
    });
  });

  test("keybinding, subscription, and CJK checks execute their real runtime paths", async () => {
    const keybinds = await check("tui.keybind-conflicts").run();
    const subscription = await check("tui.subscription-bridge").run();
    const cjk = await check("tui.wcwidth-cjk").run();

    expect(keybinds.status).toBe("warn");
    expect(keybinds.message).toContain("Keybind conflicts:");
    expect(subscription.status).toBe("ok");
    expect(subscription.message).toContain("SubscriptionBridge delivered event");
    expect(cjk.status).toBe("ok");
    expect(cjk.message).toContain("中");
  });

  test("tRPC warmup check is explicit about the current buildCaller export contract", async () => {
    const result = await check("tui.trpc-warmup").run();

    expect(["ok", "warn"]).toContain(result.status);
    expect(result.message).toMatch(/warmup|buildCaller|failed/i);
  });
});
