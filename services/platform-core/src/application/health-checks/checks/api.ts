// Health-check module for API subsystem.
// Registers 7 checks: trpc-router, zod-schemas, rest-surface,
// webhook-dispatcher, pending-delivery-backlog, connector-reachability,
// connector-run-health.

import type { SqlExecutor } from "@platform-core/infrastructure/application-database/sql.ts";

// ---------------------------------------------------------------------------
// Zod-compatible shape (no Zod dep — plain TS interface + runtime validator)
// ---------------------------------------------------------------------------

export type CheckStatus = "pass" | "warn" | "fail" | "skip";
export type CheckSeverity = "info" | "warning" | "critical";

export interface DoctorApiCheckEntry {
  name: string;
  status: CheckStatus;
  severity: CheckSeverity;
  message: string;
  recovery?: string;
  durationMs?: number;
}

export interface DoctorApiCheck {
  subsystem: "api";
  checks: DoctorApiCheckEntry[];
  summary: { pass: number; warn: number; fail: number; skip: number };
}

// ---------------------------------------------------------------------------
// Feature-flag helpers (read from env or config; default OFF)
// ---------------------------------------------------------------------------

export interface ApiDoctorConfig {
  /** Is the public REST API feature enabled? */
  publicApiEnabled: boolean;
  /** Is the outbound-webhooks feature enabled? */
  outboundWebhooksEnabled: boolean;
  /** Enabled connector definitions: { id, healthUrl, lastRunStatus?, lastSyncAt? } */
  connectors: ConnectorInfo[];
  /** Optional: function to check tRPC router health in-process */
  checkTrpcRouter?: () => Promise<{ ok: boolean; durationMs: number; error?: string }>;
  /** Optional: function to validate Zod schemas compile */
  checkZodSchemas?: () => Promise<{ ok: boolean; error?: string }>;
  /** Optional: product DB for backlog queries */
  db?: SqlExecutor;
  /** Optional: function to check REST surface */
  checkRestSurface?: () => Promise<{ ok: boolean; status?: number; error?: string }>;
  /** Optional: function to check webhook dispatcher job registration */
  checkWebhookDispatcher?: () => Promise<{ ok: boolean; error?: string }>;
  /** Optional: override for pending delivery count */
  getPendingDeliveryCount?: () => Promise<number>;
  /** Optional: function to check connector reachability (HTTP HEAD) */
  checkConnectorReachability?: (url: string) => Promise<boolean>;
  /** Per-check timeout in ms (default 1000). */
  timeoutMs?: number;
}

export interface ConnectorInfo {
  id: string;
  healthUrl: string;
  lastRunStatus?: "ok" | "error" | "unknown";
  lastSyncAt?: Date | null;
}

const DEFAULT_TIMEOUT_MS = 1000;
const DEFAULT_TIMEOUT_RECOVERY = "Check the subsystem dependency and rerun `fulcrum doctor --subsystem api`.";

function severityForStatus(status: CheckStatus): CheckSeverity {
  if (status === "fail") return "critical";
  if (status === "warn") return "warning";
  return "info";
}

function withSeverity(entry: Omit<DoctorApiCheckEntry, "severity"> & { severity?: CheckSeverity }): DoctorApiCheckEntry {
  return {
    ...entry,
    severity: entry.severity ?? severityForStatus(entry.status),
  };
}

async function runBounded(
  name: string,
  timeoutMs: number,
  fn: () => Promise<DoctorApiCheckEntry | DoctorApiCheckEntry[]>,
): Promise<DoctorApiCheckEntry[]> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return (Array.isArray(result) ? result : [result]).map((entry) => ({
      ...entry,
      durationMs: Date.now() - started,
    }));
  } catch (err) {
    return [withSeverity({
      name,
      status: "fail",
      message: (err as Error).message,
      recovery: DEFAULT_TIMEOUT_RECOVERY,
      durationMs: Date.now() - started,
    })];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkTrpcRouter(cfg: ApiDoctorConfig): Promise<DoctorApiCheckEntry> {
  if (!cfg.checkTrpcRouter) {
    return {
      name: "trpc-router",
      status: "fail",
      severity: "critical",
      message: "tRPC appRouter not available (module not loaded)",
      recovery: "Ensure apps/server/src/api/trpc/router.ts exports appRouter and Pillar 13 #04 is implemented.",
    };
  }
  try {
    const result = await cfg.checkTrpcRouter();
    if (!result.ok) {
      return {
        name: "trpc-router",
        status: "fail",
        severity: "critical",
        message: result.error ?? "tRPC router health check failed",
        recovery: "Check appRouter import; run `fulcrum product init` if DB is missing.",
      };
    }
    if (result.durationMs > 100) {
      return {
        name: "trpc-router",
        status: "warn",
        severity: "warning",
        message: `tRPC router responded in ${result.durationMs}ms (>100ms threshold)`,
        recovery: "Profile local API startup and inspect tRPC router dependencies.",
      };
    }
    return {
      name: "trpc-router",
      status: "pass",
      severity: "info",
      message: `tRPC router healthy (${result.durationMs}ms)`,
    };
  } catch (err) {
    return {
      name: "trpc-router",
      status: "fail",
      severity: "critical",
      message: `tRPC router threw: ${(err as Error).message}`,
      recovery: "Check appRouter import; ensure no circular dependencies.",
    };
  }
}

async function checkZodSchemas(cfg: ApiDoctorConfig): Promise<DoctorApiCheckEntry> {
  if (!cfg.checkZodSchemas) {
    return {
      name: "zod-schemas",
      status: "fail",
      severity: "critical",
      message: "Zod schema validator not available (module not loaded)",
      recovery: "Ensure API Zod schemas are exported and Pillar 13 #04 is implemented.",
    };
  }
  try {
    const result = await cfg.checkZodSchemas();
    if (!result.ok) {
      return {
        name: "zod-schemas",
        status: "fail",
        severity: "critical",
        message: result.error ?? "Zod schema compilation failed",
        recovery: "Run `bun run typecheck` to identify schema errors.",
      };
    }
    return {
      name: "zod-schemas",
      status: "pass",
      severity: "info",
      message: "All Zod schemas compile successfully",
    };
  } catch (err) {
    return {
      name: "zod-schemas",
      status: "fail",
      severity: "critical",
      message: `Zod schema check threw: ${(err as Error).message}`,
      recovery: "Run `bun run typecheck` to identify schema errors.",
    };
  }
}

async function checkRestSurface(cfg: ApiDoctorConfig): Promise<DoctorApiCheckEntry> {
  if (!cfg.publicApiEnabled) {
    return {
      name: "rest-surface",
      status: "skip",
      severity: "info",
      message: "public-api feature is OFF",
    };
  }
  if (!cfg.checkRestSurface) {
    return {
      name: "rest-surface",
      status: "fail",
      severity: "critical",
      message: "REST surface check not available",
      recovery: "Ensure the Nest public API health check is configured.",
    };
  }
  try {
    const result = await cfg.checkRestSurface();
    if (!result.ok) {
      return {
        name: "rest-surface",
        status: "fail",
        severity: "critical",
        message: `GET /api/v1/openapi.json returned ${result.status ?? "error"}: ${result.error ?? "unknown"}`,
        recovery: "Check the Nest public API is serving; verify public-api flag is ON.",
      };
    }
    return {
      name: "rest-surface",
      status: "pass",
      severity: "info",
      message: "GET /api/v1/openapi.json returns 200 with valid OpenAPI",
    };
  } catch (err) {
    return {
      name: "rest-surface",
      status: "fail",
      severity: "critical",
      message: `REST surface check threw: ${(err as Error).message}`,
      recovery: "Check the Nest public API is serving; verify public-api flag is ON.",
    };
  }
}

async function checkWebhookDispatcher(cfg: ApiDoctorConfig): Promise<DoctorApiCheckEntry> {
  if (!cfg.outboundWebhooksEnabled) {
    return {
      name: "webhook-dispatcher",
      status: "skip",
      severity: "info",
      message: "outbound-webhooks feature is OFF",
    };
  }
  if (!cfg.checkWebhookDispatcher) {
    return {
      name: "webhook-dispatcher",
      status: "fail",
      severity: "critical",
      message: "Webhook dispatcher check not available (module not loaded)",
      recovery: "Ensure Pillar 13 #08 webhook dispatcher is implemented.",
    };
  }
  try {
    const result = await cfg.checkWebhookDispatcher();
    if (!result.ok) {
      return {
        name: "webhook-dispatcher",
        status: "fail",
        severity: "critical",
        message: result.error ?? "Webhook dispatcher job not registered",
        recovery: "Run `fulcrum product init` to register background jobs.",
      };
    }
    return {
      name: "webhook-dispatcher",
      status: "pass",
      severity: "info",
      message: "Webhook dispatcher job registered and active",
    };
  } catch (err) {
    return {
      name: "webhook-dispatcher",
      status: "fail",
      severity: "critical",
      message: `Webhook dispatcher check threw: ${(err as Error).message}`,
      recovery: "Run `fulcrum product init` to register background jobs.",
    };
  }
}

async function checkPendingDeliveryBacklog(cfg: ApiDoctorConfig): Promise<DoctorApiCheckEntry> {
  if (!cfg.outboundWebhooksEnabled) {
    return {
      name: "pending-delivery-backlog",
      status: "skip",
      severity: "info",
      message: "outbound-webhooks feature is OFF",
    };
  }
  let count: number;
  if (cfg.getPendingDeliveryCount) {
    count = await cfg.getPendingDeliveryCount();
  } else if (cfg.db) {
    try {
      const rows = await cfg.db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM jobs WHERE queue = 'webhook-delivery' AND status IN ('queued', 'running')`,
      );
      count = rows[0]?.count ?? 0;
    } catch {
      return {
        name: "pending-delivery-backlog",
        status: "fail",
        severity: "critical",
        message: "Could not query pending delivery backlog (DB error)",
        recovery: "Run `fulcrum product init` to ensure jobs table exists.",
      };
    }
  } else {
    return {
      name: "pending-delivery-backlog",
      status: "fail",
      severity: "critical",
      message: "No DB or delivery count provider available",
      recovery: "Run `fulcrum product init` to initialise the product kernel.",
    };
  }

  if (count > 1000) {
    return {
      name: "pending-delivery-backlog",
      status: "fail",
      severity: "critical",
      message: `${count} pending deliveries (>1000 threshold)`,
      recovery: "Check webhook dispatcher is running; inspect failed deliveries with `fulcrum product jobs list`.",
    };
  }
  if (count > 100) {
    return {
      name: "pending-delivery-backlog",
      status: "warn",
      severity: "warning",
      message: `${count} pending deliveries (>100 threshold)`,
      recovery: "Check webhook dispatcher throughput before enabling outbound workflows.",
    };
  }
  return {
    name: "pending-delivery-backlog",
    status: "pass",
    severity: "info",
    message: `${count} pending deliveries`,
  };
}

async function checkConnectorReachability(cfg: ApiDoctorConfig): Promise<DoctorApiCheckEntry[]> {
  if (cfg.connectors.length === 0) {
    return [{
      name: "connector-reachability",
      status: "skip",
      severity: "info",
      message: "No connectors configured",
    }];
  }

  const results: DoctorApiCheckEntry[] = [];
  const checkFn = cfg.checkConnectorReachability ?? defaultCheckReachability;

  for (const connector of cfg.connectors) {
    const reachable = await checkFn(connector.healthUrl);
    results.push({
      name: `connector-reachability:${connector.id}`,
      status: reachable ? "pass" : "fail",
      severity: reachable ? "info" : "critical",
      message: reachable
        ? `Connector ${connector.id} reachable at ${connector.healthUrl}`
        : `Connector ${connector.id} unreachable at ${connector.healthUrl}`,
      ...(!reachable && {
        recovery: `Check connector host is up: curl -I ${connector.healthUrl}`,
      }),
    });
  }
  return results;
}

async function defaultCheckReachability(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function checkConnectorRunHealth(cfg: ApiDoctorConfig): Promise<DoctorApiCheckEntry[]> {
  if (cfg.connectors.length === 0) {
    return [{
      name: "connector-run-health",
      status: "skip",
      severity: "info",
      message: "No connectors configured",
    }];
  }

  const results: DoctorApiCheckEntry[] = [];
  const now = Date.now();
  const STALE_MS = 24 * 60 * 60 * 1000; // 24h

  for (const connector of cfg.connectors) {
    if (connector.lastRunStatus === "error") {
      results.push({
        name: `connector-run-health:${connector.id}`,
        status: "fail",
        severity: "critical",
        message: `Connector ${connector.id} last run failed`,
        recovery: `Check connector logs; re-run with \`fulcrum connector run ${connector.id}\`.`,
      });
      continue;
    }

    if (connector.lastSyncAt) {
      const age = now - connector.lastSyncAt.getTime();
      if (age > STALE_MS) {
        results.push({
          name: `connector-run-health:${connector.id}`,
          status: "warn",
          severity: "warning",
          message: `Connector ${connector.id} last synced ${Math.round(age / 3600000)}h ago (>24h threshold)`,
          recovery: `Re-run: \`fulcrum connector run ${connector.id}\`.`,
        });
        continue;
      }
    }

    if (!connector.lastSyncAt && connector.lastRunStatus !== "ok") {
      results.push({
        name: `connector-run-health:${connector.id}`,
        status: "warn",
        severity: "warning",
        message: `Connector ${connector.id} has never synced`,
        recovery: `Run initial sync: \`fulcrum connector run ${connector.id}\`.`,
      });
      continue;
    }

    results.push({
      name: `connector-run-health:${connector.id}`,
      status: "pass",
      severity: "info",
      message: `Connector ${connector.id} healthy`,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main entry: run all 7 checks, return DoctorApiCheck
// ---------------------------------------------------------------------------

export async function runApiDoctorChecks(cfg: ApiDoctorConfig): Promise<DoctorApiCheck> {
  const checks: DoctorApiCheckEntry[] = [];
  const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const groups = await Promise.all([
    runBounded("trpc-router", timeoutMs, async () => await checkTrpcRouter(cfg)),
    runBounded("zod-schemas", timeoutMs, async () => await checkZodSchemas(cfg)),
    runBounded("rest-surface", timeoutMs, async () => await checkRestSurface(cfg)),
    runBounded("webhook-dispatcher", timeoutMs, async () => await checkWebhookDispatcher(cfg)),
    runBounded("pending-delivery-backlog", timeoutMs, async () => await checkPendingDeliveryBacklog(cfg)),
    runBounded("connector-reachability", timeoutMs, async () => await checkConnectorReachability(cfg)),
    runBounded("connector-run-health", timeoutMs, async () => await checkConnectorRunHealth(cfg)),
  ]);
  checks.push(...groups.flat());

  const summary = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const c of checks) {
    summary[c.status]++;
  }

  return { subsystem: "api", checks, summary };
}

// ---------------------------------------------------------------------------
// Default config builder (reads env / product kernel when available)
// ---------------------------------------------------------------------------

export function buildDefaultApiDoctorConfig(): ApiDoctorConfig {
  return {
    publicApiEnabled: process.env["FULCRUM_PUBLIC_API"] === "1",
    outboundWebhooksEnabled: process.env["FULCRUM_OUTBOUND_WEBHOOKS"] === "1",
    connectors: [],
    // All check functions left undefined — checks will report "not available"
    // until Pillar 13 blockers are implemented and wired in.
  };
}
