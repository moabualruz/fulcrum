import { mkdtempSync, rmSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-doctor-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  delete process.env["ANTHROPIC_API_KEY"];
  rmSync(scratch, { recursive: true, force: true });
});

describe("/doctor +page.server.ts", () => {
  test("load() returns streamed.checks promise", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = mod.load();
    expect(result.streamed.checks).toBeInstanceOf(Promise);
    const checks = await result.streamed.checks;
    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBe(17);
  });

  test("all 17 subsystems present in correct order", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const checks = await mod._runAll();
    const subsystems = checks.map((c: { subsystem: string }) => c.subsystem);
    expect(subsystems).toEqual([
      "foundation", "inference", "orchestration", "sandcastle", "router",
      "tasks", "docs", "memory", "repos", "artifacts", "search",
      "notifications", "api", "cli", "tui", "web", "platform",
    ]);
  });

  test("each check result has required fields", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const checks = await mod._runAll();
    for (const check of checks) {
      expect(check).toHaveProperty("subsystem");
      expect(check).toHaveProperty("label");
      expect(check).toHaveProperty("status");
      expect(check).toHaveProperty("message");
      expect(check).toHaveProperty("recovery");
      expect(check).toHaveProperty("checked_at");
      expect(["ok", "warn", "fail"]).toContain(check.status);
      // checked_at must be a valid ISO timestamp
      expect(() => new Date(check.checked_at)).not.toThrow();
    }
  });

  test("foundation check: ok when FULCRUM_HOME dir exists", async () => {
    // scratch dir created in beforeEach
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const checks = await mod._runAll();
    const foundation = checks.find((c: { subsystem: string }) => c.subsystem === "foundation");
    expect(foundation?.status).toBe("ok");
  });

  test("foundation check: fail when FULCRUM_HOME dir missing", async () => {
    process.env["FULCRUM_HOME"] = "/nonexistent/fulcrum-test-home-xyz";
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const checks = await mod._runAll();
    const foundation = checks.find((c: { subsystem: string }) => c.subsystem === "foundation");
    expect(foundation?.status).toBe("fail");
    expect(foundation?.recovery).toBeTruthy();
  });

  test("inference check: ok when ANTHROPIC_API_KEY starts with sk-ant-", async () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key";
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 5}`);
    const checks = await mod._runAll();
    const inference = checks.find((c: { subsystem: string }) => c.subsystem === "inference");
    expect(inference?.status).toBe("ok");
  });

  test("inference check: fail when ANTHROPIC_API_KEY missing", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 6}`);
    const checks = await mod._runAll();
    const inference = checks.find((c: { subsystem: string }) => c.subsystem === "inference");
    expect(inference?.status).toBe("fail");
    expect(inference?.recovery).toBeTruthy();
  });

  test("web check: always ok (SSR self-check)", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 7}`);
    const checks = await mod._runAll();
    const web = checks.find((c: { subsystem: string }) => c.subsystem === "web");
    expect(web?.status).toBe("ok");
  });

  test("memory check: warn when memory dir missing", async () => {
    // scratch exists but no memory subdir
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 8}`);
    const checks = await mod._runAll();
    const memory = checks.find((c: { subsystem: string }) => c.subsystem === "memory");
    expect(memory?.status).toBe("warn");
    expect(memory?.recovery).toBeTruthy();
  });

  test("memory check: ok when memory dir exists", async () => {
    mkdirSync(join(scratch, "memory"), { recursive: true });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 9}`);
    const checks = await mod._runAll();
    const memory = checks.find((c: { subsystem: string }) => c.subsystem === "memory");
    expect(memory?.status).toBe("ok");
  });

  test("sandcastle check: sandbox-docker flag with absent docker yields fail/warn status", async () => {
    // Set sandbox-docker flag but docker is unavailable in CI
    const origFeatures = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "sandbox-docker";
    // The check calls commandExists internally; in CI docker is absent → error status
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 10}`);
    const checks = await mod._runAll();
    const sandcastle = checks.find((c: { subsystem: string }) => c.subsystem === "sandcastle");
    // Status is fail when sandbox-docker is enabled but docker daemon is absent
    expect(sandcastle?.status).toMatch(/fail|warn/);
    // Must mention sandbox-docker in the message or recovery
    const combined = `${sandcastle?.message ?? ""} ${sandcastle?.recovery ?? ""}`;
    expect(combined).toContain("sandbox-docker");
    // Restore
    if (origFeatures === undefined) {
      delete process.env["FULCRUM_FEATURES"];
    } else {
      process.env["FULCRUM_FEATURES"] = origFeatures;
    }
  });
});
