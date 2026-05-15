import { describe, expect, test } from "bun:test";
import {
  runRoutingDoctorChecks,
  buildDefaultRoutingDoctorConfig,
  type RoutingDoctorConfig,
  type DoctorRoutingCheck,
  type DoctorRoutingCheckEntry,
} from "./routing.ts";

function findCheck(result: DoctorRoutingCheck, name: string): DoctorRoutingCheckEntry {
  const c = result.checks.find((c) => c.name === name);
  if (!c) throw new Error(`check '${name}' not found in ${result.checks.map((c) => c.name).join(", ")}`);
  return c;
}

// ---------------------------------------------------------------------------
// 1. routing-rules-table check
// ---------------------------------------------------------------------------

describe("routing-rules-table check", () => {
  test("passes when table exists (override)", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: false,
      checkRoutingRulesTable: async () => true,
    };
    const result = await runRoutingDoctorChecks(cfg);
    const check = findCheck(result, "routing-rules-table");
    expect(check.status).toBe("pass");
    expect(check.message).toContain("exists and is reachable");
  });

  test("fails when table missing (override)", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: false,
      checkRoutingRulesTable: async () => false,
    };
    const result = await runRoutingDoctorChecks(cfg);
    const check = findCheck(result, "routing-rules-table");
    expect(check.status).toBe("fail");
    expect(check.message).toContain("not found");
    expect(check.recovery).toBeDefined();
  });

  test("fails when override throws", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: false,
      checkRoutingRulesTable: async () => { throw new Error("db down"); },
    };
    const result = await runRoutingDoctorChecks(cfg);
    const check = findCheck(result, "routing-rules-table");
    expect(check.status).toBe("fail");
    expect(check.message).toContain("db down");
  });

  test("fails when no DB and no override", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: false,
    };
    const result = await runRoutingDoctorChecks(cfg);
    const check = findCheck(result, "routing-rules-table");
    expect(check.status).toBe("fail");
    expect(check.message).toContain("No DB available");
  });
});

// ---------------------------------------------------------------------------
// 2. skills-conflicts check
// ---------------------------------------------------------------------------

describe("skills-conflicts check", () => {
  test("passes when 0 conflicts", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: false,
      getPendingConflictCount: async () => 0,
    };
    const result = await runRoutingDoctorChecks(cfg);
    const check = findCheck(result, "skills-conflicts");
    expect(check.status).toBe("pass");
    expect(check.message).toContain("0 skills");
  });

  test("warns when conflicts > 0", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: false,
      getPendingConflictCount: async () => 3,
    };
    const result = await runRoutingDoctorChecks(cfg);
    const check = findCheck(result, "skills-conflicts");
    expect(check.status).toBe("warn");
    expect(check.message).toContain("3 skills have upstream conflicts");
  });

  test("passes when no provider (defaults to 0)", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: false,
    };
    const result = await runRoutingDoctorChecks(cfg);
    const check = findCheck(result, "skills-conflicts");
    expect(check.status).toBe("pass");
  });

  test("fails when provider throws", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: false,
      getPendingConflictCount: async () => { throw new Error("lock read fail"); },
    };
    const result = await runRoutingDoctorChecks(cfg);
    const check = findCheck(result, "skills-conflicts");
    expect(check.status).toBe("fail");
    expect(check.message).toContain("lock read fail");
  });
});

// ---------------------------------------------------------------------------
// 3. router-llm check
// ---------------------------------------------------------------------------

describe("router-llm check", () => {
  test("passes with message when flag OFF", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: false,
    };
    const result = await runRoutingDoctorChecks(cfg);
    const check = findCheck(result, "router-llm");
    expect(check.status).toBe("pass");
    expect(check.message).toContain("disabled (deterministic rules only)");
  });

  test("passes when flag ON + sidecar reachable", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: true,
      checkSidecarReachable: async () => true,
    };
    const result = await runRoutingDoctorChecks(cfg);
    const check = findCheck(result, "router-llm");
    expect(check.status).toBe("pass");
    expect(check.message).toContain("enabled, sidecar OK");
  });

  test("fails when flag ON + sidecar unreachable", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: true,
      checkSidecarReachable: async () => false,
    };
    const result = await runRoutingDoctorChecks(cfg);
    const check = findCheck(result, "router-llm");
    expect(check.status).toBe("fail");
    expect(check.message).toContain("enabled, sidecar UNREACHABLE");
    expect(check.recovery).toBeDefined();
  });

  test("fails when flag ON + no sidecar check available", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: true,
    };
    const result = await runRoutingDoctorChecks(cfg);
    const check = findCheck(result, "router-llm");
    expect(check.status).toBe("fail");
    expect(check.message).toContain("sidecar health check not available");
  });

  test("fails when flag ON + sidecar check throws", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: true,
      checkSidecarReachable: async () => { throw new Error("socket timeout"); },
    };
    const result = await runRoutingDoctorChecks(cfg);
    const check = findCheck(result, "router-llm");
    expect(check.status).toBe("fail");
    expect(check.message).toContain("socket timeout");
  });
});

// ---------------------------------------------------------------------------
// 4. Summary / exit-code semantics
// ---------------------------------------------------------------------------

describe("summary and exit-code semantics", () => {
  test("all pass → summary.fail === 0", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: false,
      checkRoutingRulesTable: async () => true,
      getPendingConflictCount: async () => 0,
    };
    const result = await runRoutingDoctorChecks(cfg);
    expect(result.summary.fail).toBe(0);
    expect(result.summary.pass).toBe(3);
  });

  test("any fail → summary.fail > 0 (exit code 1 signal)", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: true,
      checkRoutingRulesTable: async () => true,
      getPendingConflictCount: async () => 0,
      checkSidecarReachable: async () => false,
    };
    const result = await runRoutingDoctorChecks(cfg);
    expect(result.summary.fail).toBeGreaterThan(0);
  });

  test("warn-only → summary.fail === 0, summary.warn > 0", async () => {
    const cfg: RoutingDoctorConfig = {
      routerLlmEnabled: false,
      checkRoutingRulesTable: async () => true,
      getPendingConflictCount: async () => 2,
    };
    const result = await runRoutingDoctorChecks(cfg);
    expect(result.summary.fail).toBe(0);
    expect(result.summary.warn).toBe(1);
  });

  test("subsystem is 'routing'", async () => {
    const cfg: RoutingDoctorConfig = { routerLlmEnabled: false };
    const result = await runRoutingDoctorChecks(cfg);
    expect(result.subsystem).toBe("routing");
  });
});

// ---------------------------------------------------------------------------
// 5. Default config builder
// ---------------------------------------------------------------------------

describe("buildDefaultRoutingDoctorConfig", () => {
  test("reads routerLlmEnabled from FULCRUM_FEATURES", () => {
    const original = process.env["FULCRUM_FEATURES"];
    try {
      process.env["FULCRUM_FEATURES"] = "router-llm,embeddings";
      const cfg = buildDefaultRoutingDoctorConfig();
      expect(cfg.routerLlmEnabled).toBe(true);
    } finally {
      if (original === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = original;
    }
  });

  test("routerLlmEnabled false when absent", () => {
    const original = process.env["FULCRUM_FEATURES"];
    try {
      delete process.env["FULCRUM_FEATURES"];
      const cfg = buildDefaultRoutingDoctorConfig();
      expect(cfg.routerLlmEnabled).toBe(false);
    } finally {
      if (original !== undefined) process.env["FULCRUM_FEATURES"] = original;
    }
  });
});
