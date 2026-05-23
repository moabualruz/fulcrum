import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: { url: new URL("http://localhost/doctor"), params: {}, route: { id: null }, status: 200, error: null, data: {}, state: {}, form: null },
}));

mock.module("$app/navigation", () => ({
  invalidateAll: async () => {},
  goto: async () => {},
}));

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
  applyAction: async () => {},
  deserialize: (s: string) => JSON.parse(s),
}));

type SubsystemStatus = "ok" | "warn" | "fail";

interface SubsystemCheckResult {
  subsystem: string;
  label: string;
  status: SubsystemStatus;
  message: string;
  recovery: string;
  checked_at: string;
  latencyP99Ms: number | null;
  recoveryCopy: string;
  recoveryCommand: string | null;
  recoveryActionKind: "recover" | "catch-up" | "open-pr" | null;
  probeTrace: { lines: Array<{ tone: string; text: string }>; traceId: string } | null;
}

interface DoctorWorkbench {
  checks: SubsystemCheckResult[];
  summary: { subsystems: number; passing: number; failing: number; failed: number; lastGreen: string };
  telemetry: Array<{
    id: string;
    title: string;
    value: string;
    delta: string;
    trend: "up" | "down" | "flat";
    sparkline: string;
    legend: Array<{ tone: string; label: string }>;
  }>;
}

type PageProps = {
  data: {
    streamed: {
      workbench: Promise<DoctorWorkbench> | DoctorWorkbench;
    };
  };
};

function okCheck(s: string): SubsystemCheckResult {
  return {
    subsystem: s,
    label: s.charAt(0).toUpperCase() + s.slice(1),
    status: "ok",
    message: `${s} ok`,
    recovery: "",
    checked_at: "2026-05-04T12:00:00.000Z",
    latencyP99Ms: 12,
    recoveryCopy: "",
    recoveryCommand: null,
    recoveryActionKind: null,
    probeTrace: null,
  };
}

const ALL_OK_CHECKS: SubsystemCheckResult[] = [
  "foundation", "inference", "orchestration", "sandcastle", "router",
  "tasks", "docs", "memory", "repos", "artifacts", "search",
  "notifications", "api", "cli", "tui", "web", "platform",
].map(okCheck);

const WITH_FAILURE: SubsystemCheckResult[] = ALL_OK_CHECKS.map((c) =>
  c.subsystem === "web"
    ? {
        ...c,
        status: "fail" as const,
        message: "Build artifact missing",
        recovery: "bun run build",
        latencyP99Ms: null,
        recoveryCopy: "Build artifact missing. Next step: run bun run build to rebuild the web subsystem.",
        recoveryCommand: "bun run build",
        recoveryActionKind: "recover" as const,
        probeTrace: {
          lines: [{ tone: "command", text: "$ doctor probe web" }],
          traceId: "tr_web_1 · 12:00:00 · 90 ms",
        },
      }
    : c,
);

function summaryOf(checks: SubsystemCheckResult[]): DoctorWorkbench["summary"] {
  return {
    subsystems: checks.length,
    passing: checks.filter((c) => c.status === "ok").length,
    failing: checks.filter((c) => c.status === "warn").length,
    failed: checks.filter((c) => c.status === "fail").length,
    lastGreen: "12:00",
  };
}

const TELEMETRY: DoctorWorkbench["telemetry"] = [
  { id: "run-success-rate", title: "Run success rate · last 1h", value: "96.3%", delta: "+0.4%", trend: "up", sparkline: "0,40 200,14", legend: [{ tone: "ok", label: "success" }] },
  { id: "active-runs", title: "Active runs · last 30m", value: "12", delta: "+3", trend: "down", sparkline: "0,40 200,14", legend: [{ tone: "ok", label: "opus-4.7" }] },
];

function workbench(checks: SubsystemCheckResult[]): DoctorWorkbench {
  return { checks, summary: summaryOf(checks), telemetry: TELEMETRY };
}

describe("/doctor +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders skeleton while workbench pending", () => {
    const pending = new Promise<DoctorWorkbench>(() => {});
    const { body } = render(Page, { props: { data: { streamed: { workbench: pending } } } });
    expect(body).toContain("data-route-skeleton");
    expect(body).toContain('data-kind="list"');
  });

  test("renders 17 subsystem rows", () => {
    const { body } = render(Page, { props: { data: { streamed: { workbench: workbench(ALL_OK_CHECKS) } } } });
    const rows = (body.match(/data-doctor-row/g) ?? []).length;
    expect(rows).toBe(17);
  });

  test("all-ok → healthy banner + passing badges", () => {
    const { body } = render(Page, { props: { data: { streamed: { workbench: workbench(ALL_OK_CHECKS) } } } });
    expect(body).toContain('data-doctor-overall="ok"');
    expect(body).toContain("All subsystems healthy.");
    // Each subsystem row carries a ui-kit StatusBadge; all-ok → `passing`.
    const badgeMatches = body.match(/data-doctor-status-badge="[\w.]+"/g) ?? [];
    expect(badgeMatches.length).toBe(17);
    const passingBadges = body.match(/data-slot="status-badge" data-status="passing"/g) ?? [];
    expect(passingBadges.length).toBe(17);
  });

  test("failure → failed banner + failed badge for failing subsystem", () => {
    const { body } = render(Page, { props: { data: { streamed: { workbench: workbench(WITH_FAILURE) } } } });
    expect(body).toContain('data-doctor-overall="fail"');
    const webRowMatch = body.match(/data-doctor-row="[^"]*" data-subsystem="web" data-status="(\w+)"/);
    expect(webRowMatch).not.toBeNull();
    expect(webRowMatch?.[1]).toBe("fail");
  });

  test("failing row carries a contextual recovery primary + copy-command button", () => {
    const { body } = render(Page, { props: { data: { streamed: { workbench: workbench(WITH_FAILURE) } } } });
    expect(body).toContain("data-doctor-recovery-action");
    expect(body).toContain('data-action-kind="recover"');
    expect(body).toContain("data-doctor-copy-command");
    expect(body).toContain("Copy: bun run build");
  });

  test("5-cell summary strip renders all five cells", () => {
    const { body } = render(Page, { props: { data: { streamed: { workbench: workbench(ALL_OK_CHECKS) } } } });
    for (const cell of ["subsystems", "passing", "failing", "failed", "last-green"]) {
      expect(body).toContain(`data-doctor-summary-cell="${cell}"`);
    }
  });

  test("two telemetry tiles render below the table", () => {
    const { body } = render(Page, { props: { data: { streamed: { workbench: workbench(ALL_OK_CHECKS) } } } });
    expect(body).toContain('data-doctor-telemetry-tile="run-success-rate"');
    expect(body).toContain('data-doctor-telemetry-tile="active-runs"');
  });

  test("Refresh now button present (invalidate-based, not reload)", () => {
    const { body } = render(Page, { props: { data: { streamed: { workbench: workbench(ALL_OK_CHECKS) } } } });
    expect(body).toContain("data-refresh-now");
    expect(body).toContain("Refresh now");
  });

  test("every subsystem row carries a mode-affordance row", () => {
    const { body } = render(Page, { props: { data: { streamed: { workbench: workbench(ALL_OK_CHECKS) } } } });
    expect(body).toContain('data-mode-affordance="step"');
    expect(body).toContain('data-mode-step-kind="subsystem-row"');
    const modeRows = (body.match(/data-doctor-mode-row/g) ?? []).length;
    expect(modeRows).toBe(17);
  });
});
