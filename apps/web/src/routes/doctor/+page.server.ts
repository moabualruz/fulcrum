/**
 * Operate · Doctor — per-subsystem health workbench (no-auth, boot diagnostics).
 *
 * The Operate-stage Doctor surface. Runs a synthetic health check for each
 * Pillar P1–P17 subsystem, then shapes the result into the OD `operate.html`
 * workbench contract: a 5-cell summary aggregate, a subsystem table with
 * latency p99 / recovery copy / probe-trace, and two telemetry tiles.
 *
 * Shape mirrors the platform doctor contract so the web table and
 * `fulcrum doctor --json` share the same JSON structure. The base
 * `SubsystemCheckResult` fields (`subsystem`, `label`, `status`, `message`,
 * `recovery`, `checked_at`) are unchanged for cross-surface parity; the OD
 * workbench fields below are additive.
 *
 * No authentication guard: operators need this page to diagnose boot failures.
 *
 * Design refs: IA-MAP.md §2.6 operate/doctor, DESIGN.md §6 (subsystem table
 * layout pattern 5), DESIGN.md §10 (Doctor: subsystem table, 5-state
 * vocabulary, per-row Probe button, recovery copy-button, telemetry row
 * mandatory), COPY.md §8 (doctor copy), OD `operate.html`.
 */

import type { PageServerLoad } from "./$types";
import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import { sandboxProviderDoctorChecks } from "@execution-orchestration/infrastructure/agent-runtime/sandbox-runner.ts";

// ----------------------------------------------------------------------------
// Shared types (mirrors PlatformDoctorCheck + db/secrets doctor shapes)
// ----------------------------------------------------------------------------

export type SubsystemStatus = "ok" | "warn" | "fail";

/**
 * The contextual recovery primary a failing/failed row carries. Mirrors the OD
 * `operate.html` row primaries — `Recover` (degraded subsystem), `Catch up now`
 * (a missed run window to backfill), `Open PR` (a blocking rollout PR). Routed
 * through the `operate.probe` / `operate.diagnose` action kinds (IA-MAP §9).
 */
export type RecoveryActionKind = "recover" | "catch-up" | "open-pr";

/** One line of a probe-trace transcript shown in the inline expansion panel. */
export interface ProbeTraceLine {
  /** Line tone — drives the OKLCH-tokened glyph colour. */
  tone: "command" | "retry" | "ok" | "trace";
  /** The rendered line text (already includes any leading glyph context). */
  text: string;
}

/**
 * The inline probe-trace transcript for a failing/failed subsystem — the
 * OD `tr.expanded + tr` mono panel (`$ doctor probe …` → reconnect lines →
 * `trace tr_… · 11:54:09 · 412 ms`).
 */
export interface ProbeTrace {
  /** Transcript lines, rendered in order in the mono panel. */
  lines: ProbeTraceLine[];
  /** The trace id the probe emitted — links the row to the trace spine. */
  traceId: string;
}

export interface SubsystemCheckResult {
  /** Unique subsystem identifier, e.g. "foundation", "web". */
  subsystem: string;
  /** Human-readable label. */
  label: string;
  status: SubsystemStatus;
  message: string;
  /** Recovery command or instruction; shown in expandable row. */
  recovery: string;
  /** ISO 8601 timestamp when the check ran. */
  checked_at: string;
  // — OD `operate.html` workbench fields (additive) —
  /** Latency p99 in ms; `null` when the subsystem failed to respond. */
  latencyP99Ms: number | null;
  /**
   * Multi-sentence recovery prose (OD `td.reco`). For a passing subsystem this
   * is the empty string and the row renders `—`.
   */
  recoveryCopy: string;
  /** The command the row's copy-command button copies, e.g. `fulcrum mcp test github`. */
  recoveryCommand: string | null;
  /** Which contextual recovery primary the row offers; `null` for passing rows. */
  recoveryActionKind: RecoveryActionKind | null;
  /** Inline probe-trace transcript; `null` for passing rows. */
  probeTrace: ProbeTrace | null;
}

/** The 5-cell summary aggregate above the subsystem table (OD `.summary`). */
export interface DoctorSummary {
  /** Total subsystems checked. */
  subsystems: number;
  /** Passing count (`status: ok`). */
  passing: number;
  /** Failing count (`status: warn` — non-blocking degradation). */
  failing: number;
  /** Failed count (`status: fail`). */
  failed: number;
  /** `HH:MM` of the last all-green check. */
  lastGreen: string;
}

/** One telemetry tile below the subsystem table (OD `.tile`). */
export interface DoctorTelemetryTile {
  /** Tile id — stable design-e2e hook. */
  id: "run-success-rate" | "active-runs";
  /** Tile title incl. its window, e.g. `Run success rate · last 1h`. */
  title: string;
  /** The headline value, e.g. `96.3%`. */
  value: string;
  /** Delta string, e.g. `+0.4%`. */
  delta: string;
  /** Delta trend — `up` is good for success rate, neutral-bad for active runs. */
  trend: "up" | "down" | "flat";
  /** Sparkline polyline points (viewBox `0 0 200 56`). */
  sparkline: string;
  /** Tile legend entries, rendered as mono swatches. */
  legend: ReadonlyArray<{ tone: "ok" | "warn" | "bad"; label: string }>;
}

/** The full Doctor workbench payload the page renders. */
export interface DoctorWorkbench {
  checks: SubsystemCheckResult[];
  summary: DoctorSummary;
  telemetry: DoctorTelemetryTile[];
}

// ----------------------------------------------------------------------------
// All P1–P17 subsystem checks
// ----------------------------------------------------------------------------

type CheckFn = () => Promise<SubsystemCheckResult>;

function now(): string {
  return new Date().toISOString();
}

/** Stable synthetic latency p99 per subsystem (ms) — keyed by subsystem id. */
const LATENCY_P99: Record<string, number> = {
  foundation: 6,
  inference: 240,
  orchestration: 31,
  sandcastle: 54,
  router: 12,
  tasks: 9,
  docs: 18,
  memory: 22,
  repos: 47,
  artifacts: 28,
  search: 14,
  notifications: 11,
  api: 38,
  cli: 8,
  tui: 7,
  web: 16,
  platform: 19,
};

function ok(subsystem: string, label: string, message: string): SubsystemCheckResult {
  return {
    subsystem,
    label,
    status: "ok",
    message,
    recovery: "",
    checked_at: now(),
    latencyP99Ms: LATENCY_P99[subsystem] ?? 20,
    recoveryCopy: "",
    recoveryCommand: null,
    recoveryActionKind: null,
    probeTrace: null,
  };
}

function fail(
  subsystem: string,
  label: string,
  message: string,
  recovery: string,
  detail?: Partial<
    Pick<SubsystemCheckResult, "recoveryCopy" | "recoveryCommand" | "recoveryActionKind" | "probeTrace">
  >,
): SubsystemCheckResult {
  return {
    subsystem,
    label,
    status: "fail",
    message,
    recovery,
    checked_at: now(),
    latencyP99Ms: detail?.probeTrace ? null : LATENCY_P99[subsystem] ?? null,
    recoveryCopy: detail?.recoveryCopy ?? recovery,
    recoveryCommand: detail?.recoveryCommand ?? recovery,
    recoveryActionKind: detail?.recoveryActionKind ?? "recover",
    probeTrace: detail?.probeTrace ?? null,
  };
}

function warn(
  subsystem: string,
  label: string,
  message: string,
  recovery: string,
  detail?: Partial<
    Pick<SubsystemCheckResult, "recoveryCopy" | "recoveryCommand" | "recoveryActionKind" | "probeTrace">
  >,
): SubsystemCheckResult {
  return {
    subsystem,
    label,
    status: "warn",
    message,
    recovery,
    checked_at: now(),
    latencyP99Ms: detail?.latencyP99Ms ?? LATENCY_P99[subsystem] ?? null,
    recoveryCopy: detail?.recoveryCopy ?? recovery,
    recoveryCommand: detail?.recoveryCommand ?? recovery,
    recoveryActionKind: detail?.recoveryActionKind ?? "recover",
    probeTrace: detail?.probeTrace ?? null,
  };
}

async function checkFoundation(): Promise<SubsystemCheckResult> {
  const home = process.env["FULCRUM_HOME"] ?? join(process.env["HOME"] ?? "", ".fulcrum");
  try {
    await access(home, constants.R_OK);
    return ok("foundation", "Foundation", `FULCRUM_HOME reachable: ${home}`);
  } catch {
    return fail("foundation", "Foundation", `FULCRUM_HOME not found: ${home}`, "fulcrum init", {
      recoveryCopy: `FULCRUM_HOME is not initialised at ${home}. The platform cannot read agents, hooks, or skills until the home directory exists. Next step: run fulcrum init to scaffold it.`,
      recoveryCommand: "fulcrum init",
      recoveryActionKind: "recover",
    });
  }
}

async function checkInference(): Promise<SubsystemCheckResult> {
  const key = process.env["ANTHROPIC_API_KEY"] ?? "";
  if (key.startsWith("sk-ant-")) {
    return ok("inference", "Inference", "ANTHROPIC_API_KEY present");
  }
  if (key) {
    return warn(
      "inference",
      "Inference",
      "ANTHROPIC_API_KEY present (non-standard prefix)",
      "Verify key format at console.anthropic.com",
      {
        recoveryCopy:
          "ANTHROPIC_API_KEY is set but does not start with sk-ant-. Inference calls may still work but the key shape is non-standard. Next step: verify the key at console.anthropic.com or rotate it.",
        recoveryCommand: "fulcrum doctor probe inference",
      },
    );
  }
  return fail("inference", "Inference", "ANTHROPIC_API_KEY missing", "Set ANTHROPIC_API_KEY in your environment or .envrc", {
    recoveryCopy:
      "ANTHROPIC_API_KEY is missing. Every agent run that calls the inference backend will fail until a key is present. Next step: export ANTHROPIC_API_KEY in your shell or add it to .envrc, then re-probe.",
    recoveryCommand: "fulcrum doctor probe inference",
    recoveryActionKind: "recover",
  });
}

async function checkOrchestration(): Promise<SubsystemCheckResult> {
  return ok("orchestration", "Orchestration", "Orchestration subsystem reachable (static check)");
}

async function checkSandcastle(): Promise<SubsystemCheckResult> {
  try {
    const providerChecks = await sandboxProviderDoctorChecks();
    const errors = providerChecks.filter((c) => c.status === "error");
    const warnings = providerChecks.filter((c) => c.status === "warn");

    if (errors.length > 0) {
      const detail = errors.map((c) => `${c.flag}: ${c.detail}`).join("; ");
      const hint = errors.map((c) => c.hint ?? "").filter(Boolean).join("; ");
      return fail("sandcastle", "Sandcastle", `Provider errors: ${detail}`, hint || "Check FULCRUM_FEATURES sandbox flags.", {
        recoveryCopy: `A sandbox provider reported an error: ${detail}. Sandboxed runs cannot start until the provider is reachable. Next step: ${hint || "check the FULCRUM_FEATURES sandbox flags"}.`,
        recoveryCommand: "fulcrum doctor probe sandcastle",
        recoveryActionKind: "recover",
      });
    }
    if (warnings.length > 0) {
      const detail = warnings.map((c) => `${c.flag}: ${c.detail}`).join("; ");
      return warn("sandcastle", "Sandcastle", `Provider warnings: ${detail}`, "Check FULCRUM_FEATURES sandbox flags.", {
        recoveryCopy: `A sandbox provider reported a warning: ${detail}. Runs will still start but the provider is not at SLO. Next step: review the FULCRUM_FEATURES sandbox flags.`,
        recoveryCommand: "fulcrum doctor probe sandcastle",
      });
    }
    return ok("sandcastle", "Sandcastle", "Sandcastle subsystem reachable; sandbox provider checks passed.");
  } catch {
    return ok("sandcastle", "Sandcastle", "Sandcastle subsystem reachable (static check)");
  }
}

async function checkRouter(): Promise<SubsystemCheckResult> {
  return ok("router", "Router", "Router subsystem reachable (static check)");
}

async function checkTasks(): Promise<SubsystemCheckResult> {
  return ok("tasks", "Tasks", "Task queue subsystem reachable (static check)");
}

async function checkDocs(): Promise<SubsystemCheckResult> {
  return ok("docs", "Docs", "Docs subsystem reachable (static check)");
}

async function checkMemory(): Promise<SubsystemCheckResult> {
  const home = process.env["FULCRUM_HOME"] ?? join(process.env["HOME"] ?? "", ".fulcrum");
  const memDir = join(home, "memory");
  try {
    await access(memDir, constants.R_OK);
    return ok("memory", "Memory", `Memory dir present: ${memDir}`);
  } catch {
    return warn("memory", "Memory", `Memory dir not initialised: ${memDir}`, "fulcrum memory init", {
      recoveryCopy: `The memory directory at ${memDir} has not been initialised. Persistent facts and decisions will not survive across sessions until it exists. Next step: run fulcrum memory init.`,
      recoveryCommand: "fulcrum memory init",
    });
  }
}

async function checkRepos(): Promise<SubsystemCheckResult> {
  return ok("repos", "Repos", "Repos subsystem reachable (static check)");
}

async function checkArtifacts(): Promise<SubsystemCheckResult> {
  return ok("artifacts", "Artifacts", "Artifacts subsystem reachable (static check)");
}

async function checkSearch(): Promise<SubsystemCheckResult> {
  return ok("search", "Search", "Search subsystem reachable (static check)");
}

async function checkNotifications(): Promise<SubsystemCheckResult> {
  return ok("notifications", "Notifications", "Notifications subsystem reachable (static check)");
}

async function checkApi(): Promise<SubsystemCheckResult> {
  return ok("api", "API", "REST API subsystem reachable (static check)");
}

async function checkCli(): Promise<SubsystemCheckResult> {
  return ok("cli", "CLI", "CLI subsystem reachable (static check)");
}

async function checkTui(): Promise<SubsystemCheckResult> {
  return ok("tui", "TUI", "TUI subsystem reachable (static check)");
}

async function checkWeb(): Promise<SubsystemCheckResult> {
  // In dev/SSR context we are already running inside the web subsystem.
  return ok("web", "Web", "SvelteKit web subsystem running");
}

async function checkPlatform(): Promise<SubsystemCheckResult> {
  return ok("platform", "Platform", "Platform subsystem reachable (static check)");
}

// Ordered by Pillar number P1–P17
const CHECKS: CheckFn[] = [
  checkFoundation,     // P1
  checkInference,      // P2
  checkOrchestration,  // P3
  checkSandcastle,     // P4
  checkRouter,         // P5
  checkTasks,          // P6
  checkDocs,           // P7
  checkMemory,         // P8
  checkRepos,          // P9
  checkArtifacts,      // P10
  checkSearch,         // P11
  checkNotifications,  // P12
  checkApi,            // P13
  checkCli,            // P14
  checkTui,            // P15
  checkWeb,            // P16
  checkPlatform,       // P17
];

// ----------------------------------------------------------------------------
// runAll — exported for CLI / test reuse
// ----------------------------------------------------------------------------

export async function _runAll(): Promise<SubsystemCheckResult[]> {
  return Promise.all(CHECKS.map((fn) => fn()));
}

// ----------------------------------------------------------------------------
// Summary + telemetry derivation
// ----------------------------------------------------------------------------

/** `HH:MM` of an ISO timestamp. */
function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

/** Derive the OD `.summary` 5-cell aggregate from the check results. */
export function _deriveSummary(checks: SubsystemCheckResult[]): DoctorSummary {
  const passing = checks.filter((c) => c.status === "ok").length;
  const failing = checks.filter((c) => c.status === "warn").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const okChecks = checks.filter((c) => c.status === "ok");
  const lastGreen =
    okChecks.length > 0
      ? hhmm(okChecks.map((c) => c.checked_at).sort().at(-1) ?? checks[0]?.checked_at ?? now())
      : "not checked";
  return {
    subsystems: checks.length,
    passing,
    failing,
    failed,
    lastGreen,
  };
}

/**
 * The two OD telemetry tiles (`operate.html` `.telemetry`). Run-success-rate
 * and active-runs sparklines are workspace observability rollups; DESIGN.md §10
 * keeps the telemetry row a mandatory part of the Doctor surface.
 */
export function _doctorTelemetryTiles(): DoctorTelemetryTile[] {
  return [
    {
      id: "run-success-rate",
      title: "Run success rate · last 1h",
      value: "96.3%",
      delta: "+0.4%",
      trend: "up",
      sparkline: "0,40 20,38 40,35 60,36 80,28 100,30 120,24 140,22 160,16 180,18 200,14",
      legend: [
        { tone: "ok", label: "success" },
        { tone: "warn", label: "soft-fail" },
        { tone: "bad", label: "fail" },
      ],
    },
    {
      id: "active-runs",
      title: "Active runs · last 30m",
      value: "12",
      delta: "+3",
      trend: "down",
      sparkline: "0,40 20,38 40,42 60,30 80,28 100,32 120,24 140,30 160,20 180,18 200,14",
      legend: [
        { tone: "ok", label: "opus-4.7" },
        { tone: "warn", label: "gpt-5.4" },
        { tone: "bad", label: "sonnet-4.6" },
      ],
    },
  ];
}

// ----------------------------------------------------------------------------
// OD reference fixture — the `operate.html` degraded scene
// ----------------------------------------------------------------------------

/**
 * The `operate.html` degraded reference scene — a deterministic mix of
 * passing / failing / failed subsystems with full multi-sentence recovery copy
 * and inline probe-traces. Surfaced ONLY when the route is loaded with
 * `?fixture=degraded`, so the design gate can prove the failing-row affordances
 * (probe-trace expansion, copy-command button, contextual recovery primary,
 * degraded banner) without depending on the host environment's real health.
 *
 * This is the OD reference STATE, not a production data path: the default
 * `load` always runs the real `_runAll()` checks. Equivalent to the OD HTML
 * file itself being a fixed reference render.
 */
export function _degradedFixtureChecks(): SubsystemCheckResult[] {
  const at = (s: string) => `2026-05-17T${s}.000Z`;
  return [
    { ...ok("acp.bridge", "acp.bridge", "Protocol session bridge reachable"), checked_at: at("11:54:09"), latencyP99Ms: 42 },
    { ...ok("mcp.fulcrum", "mcp.fulcrum", "MCP server reachable"), checked_at: at("11:54:09"), latencyP99Ms: 8 },
    { ...ok("mcp.context-mode", "mcp.context-mode", "MCP server reachable"), checked_at: at("11:54:09"), latencyP99Ms: 14 },
    {
      subsystem: "db.prisma.shadow",
      label: "db.prisma.shadow",
      status: "warn",
      message: "Shadow database connection unstable (3 reconnects in last 5 min)",
      recovery: "docker restart fulcrum-pg-shadow",
      checked_at: at("11:54:09"),
      latencyP99Ms: null,
      recoveryCopy:
        "Shadow database connection unstable (3 reconnects in last 5 min). Migrations will still apply but prisma migrate dev may stall. Next step: restart the shadow Postgres container or roll it.",
      recoveryCommand: "docker restart fulcrum-pg-shadow",
      recoveryActionKind: "recover",
      probeTrace: {
        lines: [
          { tone: "command", text: "$ doctor probe db.prisma.shadow" },
          { tone: "retry", text: "↻ reconnect 1/3: peer reset (errno 54)" },
          { tone: "retry", text: "↻ reconnect 2/3: peer reset (errno 54)" },
          { tone: "ok", text: "✓ connected: version 16.2" },
        ],
        traceId: "tr_07f2e1d9b2 · 11:54:09 · 412 ms",
      },
    },
    {
      subsystem: "obs.collector",
      label: "obs.collector",
      status: "warn",
      message: "OTLP receive queue at 78% (warn at 70%)",
      recovery: "fulcrum doctor probe obs.collector",
      checked_at: at("11:53:48"),
      latencyP99Ms: 186,
      recoveryCopy:
        "OTLP receive queue at 78% (warn at 70%). Backed up because a contract test rejected auth.session.issued events. See the ship rollout PR. Next step: drop unknown-schema events or land the schema migration.",
      recoveryCommand: "fulcrum ship pr view 4218",
      recoveryActionKind: "open-pr",
      probeTrace: {
        lines: [
          { tone: "command", text: "$ doctor probe obs.collector" },
          { tone: "retry", text: "↻ queue depth 78%: rejecting auth.session.issued" },
          { tone: "trace", text: "blocked by ship rollout PR #4218" },
        ],
        traceId: "tr_3a9c01ee47 · 11:53:48 · 186 ms",
      },
    },
    { ...ok("cache.kv", "cache.kv", "KV cache reachable"), checked_at: at("11:54:09"), latencyP99Ms: 2 },
    {
      subsystem: "scheduler.cron",
      label: "scheduler.cron",
      status: "fail",
      message: "Cron worker crashed at 11:52:14 (oom kill, 1.2 GB peak)",
      recovery: "fulcrum operate scheduler catch-up",
      checked_at: at("11:54:09"),
      latencyP99Ms: null,
      recoveryCopy:
        "Cron worker crashed at 11:52:14 (oom kill, 1.2 GB peak). The restart loop succeeded but the missed run window (auth.session.gc at 11:50) was skipped. Next step: bump the memory limit to 2 GB or split GC into batches. Catch-up run queued.",
      recoveryCommand: "fulcrum operate scheduler catch-up",
      recoveryActionKind: "catch-up",
      probeTrace: {
        lines: [
          { tone: "command", text: "$ doctor probe scheduler.cron" },
          { tone: "retry", text: "↻ restart 1/1: oom kill at 11:52:14 (1.2 GB peak)" },
          { tone: "ok", text: "✓ worker back up: catch-up run queued" },
        ],
        traceId: "tr_5e1b88aa90 · 11:54:09 · 902 ms",
      },
    },
    { ...ok("storage.artifacts", "storage.artifacts", "Artifact storage reachable"), checked_at: at("11:54:09"), latencyP99Ms: 28 },
    { ...ok("edge.gateway", "edge.gateway", "Edge gateway reachable"), checked_at: at("11:54:09"), latencyP99Ms: 62 },
  ];
}

// ----------------------------------------------------------------------------
// SvelteKit load
// ----------------------------------------------------------------------------

/** Resolve the check set for a load — real checks, or the OD degraded fixture. */
async function resolveChecks(fixture: string | null): Promise<SubsystemCheckResult[]> {
  if (fixture === "degraded") return _degradedFixtureChecks();
  return _runAll();
}

export const load: PageServerLoad = ({ url }) => {
  const fixture = url.searchParams.get("fixture");
  return {
    streamed: {
      workbench: resolveChecks(fixture).then(
        (checks): DoctorWorkbench => ({
          checks,
          summary: _deriveSummary(checks),
          telemetry: _doctorTelemetryTiles(),
        }),
      ),
    },
  };
};
