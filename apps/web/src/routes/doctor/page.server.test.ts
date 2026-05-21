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
  test("flat /doctor redirects to the canonical Operate Doctor wrapper", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    try {
      mod.load({ url: new URL("http://localhost/doctor") });
      throw new Error("expected redirect");
    } catch (redirect) {
      expect((redirect as { status?: number }).status).toBe(308);
      expect((redirect as { location?: string }).location).toBe("/mkh/projects/fulcrum/operate/doctor");
    }
  });

  test("flat /doctor preserves query params when redirecting", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 100}`);
    try {
      mod.load({ url: new URL("http://localhost/doctor?fixture=degraded") });
      throw new Error("expected redirect");
    } catch (redirect) {
      expect((redirect as { status?: number }).status).toBe(308);
      expect((redirect as { location?: string }).location).toBe("/mkh/projects/fulcrum/operate/doctor?fixture=degraded");
    }
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
      expect(check).toHaveProperty("latencyP99Ms");
      expect(check).toHaveProperty("recoveryCopy");
      expect(check).toHaveProperty("recoveryCommand");
      expect(check).toHaveProperty("recoveryActionKind");
      expect(check).toHaveProperty("probeTrace");
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

  test("sandcastle check surfaces a well-formed subsystem status when sandbox-docker is enabled", async () => {
    // The deterministic docker-absent/-present matrix lives in
    // services/execution-orchestration/.../sandbox-runner.test.ts, where
    // commandExists is injected ("doctor check for sandbox-docker yields error
    // status when docker absent" / "...ok when docker present"). This
    // route-level test only verifies the _runAll integration: the sandcastle
    // subsystem is present and reports a well-formed status. The concrete
    // status depends on whether a docker daemon happens to be reachable on the
    // host — asserting it would pass in CI yet fail on a dev box with Docker
    // Desktop installed, so the shape is asserted, not the host-dependent value.
    const origFeatures = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "sandbox-docker";
    try {
      const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 10}`);
      const checks = await mod._runAll();
      const sandcastle = checks.find((c: { subsystem: string }) => c.subsystem === "sandcastle");
      expect(sandcastle).toBeDefined();
      expect(sandcastle?.status).toMatch(/ok|warn|fail/);
      expect(sandcastle?.label).toBe("Sandcastle");
      expect(typeof sandcastle?.message).toBe("string");
      expect((sandcastle?.message ?? "").length).toBeGreaterThan(0);
    } finally {
      if (origFeatures === undefined) {
        delete process.env["FULCRUM_FEATURES"];
      } else {
        process.env["FULCRUM_FEATURES"] = origFeatures;
      }
    }
  });
});
