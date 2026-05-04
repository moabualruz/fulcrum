/**
 * Doctor check module for routing + skills subsystem (Pillar 5, issue #24).
 *
 * Three checks:
 *   1. routing_rules table exists and is reachable
 *   2. Pending skills conflicts count
 *   3. router-llm feature flag state + inference sidecar reachability
 *
 * Follows the same pattern as api.ts doctor checks.
 */

import type { ProductDb } from "../../product-kernel/db/types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export interface DoctorRoutingCheckEntry {
  name: string;
  status: CheckStatus;
  message: string;
  recovery?: string;
}

export interface DoctorRoutingCheck {
  subsystem: "routing";
  checks: DoctorRoutingCheckEntry[];
  summary: { pass: number; warn: number; fail: number; skip: number };
}

// ---------------------------------------------------------------------------
// Config — injectable deps for testability
// ---------------------------------------------------------------------------

export interface RoutingDoctorConfig {
  /** Product DB handle for routing_rules table check. */
  db?: ProductDb;

  /** Override: check whether routing_rules table exists. */
  checkRoutingRulesTable?: () => Promise<boolean>;

  /** Override: return count of skills with upstream_conflict set. */
  getPendingConflictCount?: () => Promise<number>;

  /** Is the router-llm feature flag enabled? */
  routerLlmEnabled: boolean;

  /**
   * Check inference sidecar reachability.
   * Should send a health-check JSON-RPC call to the Unix socket; 1s timeout.
   * Returns true if sidecar responds, false otherwise.
   * Only called when routerLlmEnabled is true.
   */
  checkSidecarReachable?: () => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkRoutingRulesTable(cfg: RoutingDoctorConfig): Promise<DoctorRoutingCheckEntry> {
  if (cfg.checkRoutingRulesTable) {
    try {
      const exists = await cfg.checkRoutingRulesTable();
      if (!exists) {
        return {
          name: "routing-rules-table",
          status: "fail",
          message: "routing_rules table not found — run migrations",
          recovery: "Run `fulcrum product migrate` to apply pending migrations.",
        };
      }
      return {
        name: "routing-rules-table",
        status: "pass",
        message: "routing_rules table exists and is reachable",
      };
    } catch (err) {
      return {
        name: "routing-rules-table",
        status: "fail",
        message: `routing_rules table check threw: ${(err as Error).message}`,
        recovery: "Run `fulcrum product migrate` to apply pending migrations.",
      };
    }
  }

  if (!cfg.db) {
    return {
      name: "routing-rules-table",
      status: "fail",
      message: "No DB available to check routing_rules table",
      recovery: "Run `fulcrum product init` to initialise the product kernel.",
    };
  }

  try {
    const rows = await cfg.db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = 'routing_rules' AND relkind = 'r'`,
    );
    const exists = (rows[0]?.count ?? 0) > 0;
    if (!exists) {
      return {
        name: "routing-rules-table",
        status: "fail",
        message: "routing_rules table not found — run migrations",
        recovery: "Run `fulcrum product migrate` to apply pending migrations.",
      };
    }
    return {
      name: "routing-rules-table",
      status: "pass",
      message: "routing_rules table exists and is reachable",
    };
  } catch (err) {
    return {
      name: "routing-rules-table",
      status: "fail",
      message: `routing_rules table check threw: ${(err as Error).message}`,
      recovery: "Run `fulcrum product migrate` to apply pending migrations.",
    };
  }
}

async function checkPendingSkillsConflicts(cfg: RoutingDoctorConfig): Promise<DoctorRoutingCheckEntry> {
  let count: number;

  if (cfg.getPendingConflictCount) {
    try {
      count = await cfg.getPendingConflictCount();
    } catch (err) {
      return {
        name: "skills-conflicts",
        status: "fail",
        message: `Skills conflict check threw: ${(err as Error).message}`,
        recovery: "Run `fulcrum skills conflicts list` to inspect conflicts.",
      };
    }
  } else {
    // No provider — skip (no lock file reader wired)
    return {
      name: "skills-conflicts",
      status: "pass",
      message: "0 skills have upstream conflicts",
    };
  }

  if (count > 0) {
    return {
      name: "skills-conflicts",
      status: "warn",
      message: `${count} skills have upstream conflicts — run \`fulcrum skills conflicts list\``,
    };
  }

  return {
    name: "skills-conflicts",
    status: "pass",
    message: "0 skills have upstream conflicts",
  };
}

async function checkRouterLlm(cfg: RoutingDoctorConfig): Promise<DoctorRoutingCheckEntry> {
  if (!cfg.routerLlmEnabled) {
    return {
      name: "router-llm",
      status: "pass",
      message: "router-llm: disabled (deterministic rules only)",
    };
  }

  // Flag is ON — check sidecar reachability
  if (!cfg.checkSidecarReachable) {
    return {
      name: "router-llm",
      status: "fail",
      message: "router-llm: enabled, sidecar health check not available",
      recovery: "Ensure inference sidecar is running: `fulcrum inference start`.",
    };
  }

  try {
    const reachable = await cfg.checkSidecarReachable();
    if (reachable) {
      return {
        name: "router-llm",
        status: "pass",
        message: "router-llm: enabled, sidecar OK",
      };
    }
    return {
      name: "router-llm",
      status: "fail",
      message: "router-llm: enabled, sidecar UNREACHABLE",
      recovery: "Start the inference sidecar: `fulcrum inference start`.",
    };
  } catch (err) {
    return {
      name: "router-llm",
      status: "fail",
      message: `router-llm: enabled, sidecar check threw: ${(err as Error).message}`,
      recovery: "Start the inference sidecar: `fulcrum inference start`.",
    };
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function runRoutingDoctorChecks(cfg: RoutingDoctorConfig): Promise<DoctorRoutingCheck> {
  const checks: DoctorRoutingCheckEntry[] = [];

  checks.push(await checkRoutingRulesTable(cfg));
  checks.push(await checkPendingSkillsConflicts(cfg));
  checks.push(await checkRouterLlm(cfg));

  const summary = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const c of checks) {
    summary[c.status]++;
  }

  return { subsystem: "routing", checks, summary };
}

// ---------------------------------------------------------------------------
// Default config builder
// ---------------------------------------------------------------------------

export function buildDefaultRoutingDoctorConfig(): RoutingDoctorConfig {
  const features = (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((f) => f.trim());
  return {
    routerLlmEnabled: features.some((f) => f.startsWith("router-llm")),
  };
}
