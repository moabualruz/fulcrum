/**
 * Performance budget unit tests (P16 Issue #28).
 *
 * Covers:
 *   - Budget constants are within spec (sanity guard against accidental drift).
 *   - Autosave round-trip < 200ms: tRPC stub with timer injection.
 *   - Doctor web performance checks: ssr_ttfb, nav_p95, bundle_size, build_time,
 *     lighthouse_score, kanban_load, table_scroll, cmdK_open checks.
 *
 * These are RED until the implementation in src/doctor/checks/web.ts + the
 * autosave tRPC hook carry the new performance checks.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import {
  runWebDoctorChecks,
  buildDefaultWebDoctorConfig,
  type WebDoctorConfig,
  type WebPerfBudgets,
  PERF_BUDGETS,
} from "../../src/doctor/checks/web.ts";

// ---------------------------------------------------------------------------
// Budget constants sanity
// ---------------------------------------------------------------------------

describe("PERF_BUDGETS constants", () => {
  test("ssr_ttfb_p95_ms is 100", () => {
    expect(PERF_BUDGETS.ssr_ttfb_p95_ms).toBe(100);
  });

  test("nav_p95_ms is 100", () => {
    expect(PERF_BUDGETS.nav_p95_ms).toBe(100);
  });

  test("kanban_cold_load_ms is 300", () => {
    expect(PERF_BUDGETS.kanban_cold_load_ms).toBe(300);
  });

  test("cmdK_open_ms is 50", () => {
    expect(PERF_BUDGETS.cmdK_open_ms).toBe(50);
  });

  test("autosave_roundtrip_ms is 200", () => {
    expect(PERF_BUDGETS.autosave_roundtrip_ms).toBe(200);
  });

  test("build_timeout_ms is 60_000", () => {
    expect(PERF_BUDGETS.build_timeout_ms).toBe(60_000);
  });

  test("lighthouse_min_score is 85", () => {
    expect(PERF_BUDGETS.lighthouse_min_score).toBe(85);
  });
});

// ---------------------------------------------------------------------------
// Autosave round-trip stub
// ---------------------------------------------------------------------------

describe("autosave round-trip budget", () => {
  test("passes when tRPC stub resolves within 200ms", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      checkAutosaveRoundtrip: async () => ({
        measuredMs: 150,
        withinBudget: true,
      }),
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "autosave_roundtrip");
    expect(check).toBeDefined();
    expect(check!.status).toBe("pass");
    expect(check!.message).toContain("150");
  });

  test("fails when tRPC stub exceeds 200ms", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      checkAutosaveRoundtrip: async () => ({
        measuredMs: 250,
        withinBudget: false,
      }),
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "autosave_roundtrip");
    expect(check!.status).toBe("fail");
    expect(check!.message).toContain("250");
    expect(check!.recovery).toContain("200ms");
  });

  test("warns when stub throws (measurement unavailable)", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      checkAutosaveRoundtrip: async () => {
        throw new Error("tRPC unavailable");
      },
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "autosave_roundtrip");
    expect(check!.status).toBe("warn");
    expect(check!.message).toContain("tRPC unavailable");
  });
});

// ---------------------------------------------------------------------------
// SSR first-byte p95 doctor check
// ---------------------------------------------------------------------------

describe("ssr_ttfb check", () => {
  test("passes when p95 < 100ms", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      checkSsrTtfbP95: async () => ({ p95Ms: 80 }),
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "ssr_ttfb");
    expect(check!.status).toBe("pass");
    expect(check!.message).toContain("80");
  });

  test("fails when p95 >= 100ms", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      checkSsrTtfbP95: async () => ({ p95Ms: 120 }),
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "ssr_ttfb");
    expect(check!.status).toBe("fail");
    expect(check!.message).toContain("120");
    expect(check!.recovery).toContain("100ms");
  });

  test("skips when no measurement provided", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      checkSsrTtfbP95: undefined,
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "ssr_ttfb");
    expect(check!.status).toBe("skip");
  });
});

// ---------------------------------------------------------------------------
// Page navigation p95 doctor check
// ---------------------------------------------------------------------------

describe("nav_p95 check", () => {
  test("passes when p95 < 100ms", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      checkNavP95: async () => ({ p95Ms: 60 }),
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "nav_p95");
    expect(check!.status).toBe("pass");
  });

  test("fails when p95 >= 100ms", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      checkNavP95: async () => ({ p95Ms: 110 }),
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "nav_p95");
    expect(check!.status).toBe("fail");
  });

  test("skips when no measurement provided", async () => {
    const result = await runWebDoctorChecks(buildDefaultWebDoctorConfig());
    const check = result.checks.find((c) => c.name === "nav_p95");
    expect(check!.status).toBe("skip");
  });
});

// ---------------------------------------------------------------------------
// Lighthouse score check
// ---------------------------------------------------------------------------

describe("lighthouse_score check", () => {
  test("passes when score >= 85", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      checkLighthouseScore: async () => ({ score: 91 }),
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "lighthouse_score");
    expect(check!.status).toBe("pass");
    expect(check!.message).toContain("91");
  });

  test("fails when score < 85", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      checkLighthouseScore: async () => ({ score: 72 }),
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "lighthouse_score");
    expect(check!.status).toBe("fail");
    expect(check!.message).toContain("72");
    expect(check!.recovery).toContain("85");
  });

  test("skips when no measurement provided", async () => {
    const result = await runWebDoctorChecks(buildDefaultWebDoctorConfig());
    const check = result.checks.find((c) => c.name === "lighthouse_score");
    expect(check!.status).toBe("skip");
  });
});

// ---------------------------------------------------------------------------
// Kanban cold load check
// ---------------------------------------------------------------------------

describe("kanban_load check", () => {
  test("passes when cold load < 300ms", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      checkKanbanColdLoad: async () => ({ measuredMs: 200 }),
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "kanban_load");
    expect(check!.status).toBe("pass");
  });

  test("fails when cold load >= 300ms", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      checkKanbanColdLoad: async () => ({ measuredMs: 350 }),
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "kanban_load");
    expect(check!.status).toBe("fail");
    expect(check!.recovery).toContain("300ms");
  });

  test("skips when no measurement provided", async () => {
    const result = await runWebDoctorChecks(buildDefaultWebDoctorConfig());
    const check = result.checks.find((c) => c.name === "kanban_load");
    expect(check!.status).toBe("skip");
  });
});

// ---------------------------------------------------------------------------
// CmdK open check
// ---------------------------------------------------------------------------

describe("cmdK_open check", () => {
  test("passes when open < 50ms", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      checkCmdKOpen: async () => ({ measuredMs: 30 }),
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "cmdK_open");
    expect(check!.status).toBe("pass");
  });

  test("fails when open >= 50ms", async () => {
    const cfg: WebDoctorConfig = {
      ...buildDefaultWebDoctorConfig(),
      checkCmdKOpen: async () => ({ measuredMs: 60 }),
    };
    const result = await runWebDoctorChecks(cfg);
    const check = result.checks.find((c) => c.name === "cmdK_open");
    expect(check!.status).toBe("fail");
  });

  test("skips when no measurement provided", async () => {
    const result = await runWebDoctorChecks(buildDefaultWebDoctorConfig());
    const check = result.checks.find((c) => c.name === "cmdK_open");
    expect(check!.status).toBe("skip");
  });
});

// ---------------------------------------------------------------------------
// Summary counts all new checks
// ---------------------------------------------------------------------------

describe("summary includes all perf checks", () => {
  test("8 web checks exist in output (pass+warn+fail+skip >= 8)", async () => {
    const result = await runWebDoctorChecks(buildDefaultWebDoctorConfig());
    const total =
      result.summary.pass +
      result.summary.warn +
      result.summary.fail +
      result.summary.skip;
    // tauri_build + ssr_ttfb + nav_p95 + kanban_load + table_scroll + cmdK_open
    // + autosave_roundtrip + lighthouse_score = 8
    expect(total).toBeGreaterThanOrEqual(8);
  });

  test("subsystem is web", async () => {
    const result = await runWebDoctorChecks(buildDefaultWebDoctorConfig());
    expect(result.subsystem).toBe("web");
  });
});
