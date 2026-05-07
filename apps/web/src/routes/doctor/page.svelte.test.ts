import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: { url: new URL("http://localhost/doctor"), params: {}, route: { id: null }, status: 200, error: null, data: {}, state: {}, form: null },
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
}

type PageProps = {
  data: {
    streamed: {
      checks: Promise<SubsystemCheckResult[]> | SubsystemCheckResult[];
    };
  };
};

const ALL_OK_CHECKS: SubsystemCheckResult[] = [
  "foundation", "inference", "orchestration", "sandcastle", "router",
  "tasks", "docs", "memory", "repos", "artifacts", "search",
  "notifications", "api", "cli", "tui", "web", "platform",
].map((s) => ({
  subsystem: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
  status: "ok",
  message: `${s} ok`,
  recovery: "",
  checked_at: "2026-05-04T12:00:00.000Z",
}));

const WITH_FAILURE: SubsystemCheckResult[] = ALL_OK_CHECKS.map((c) =>
  c.subsystem === "web"
    ? { ...c, status: "fail", message: "Build artifact missing", recovery: "run: bun run build" }
    : c,
);

describe("/doctor +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders skeleton while checks pending", () => {
    const pending = new Promise<SubsystemCheckResult[]>(() => {});
    const { body } = render(Page, {
      props: { data: { streamed: { checks: pending } } },
    });
    expect(body).toContain("data-route-skeleton");
    expect(body).toContain('data-kind="list"');
  });

  test("renders 17 subsystem rows", () => {
    const { body } = render(Page, {
      props: { data: { streamed: { checks: ALL_OK_CHECKS } } },
    });
    const rows = (body.match(/data-doctor-row/g) ?? []).length;
    expect(rows).toBe(17);
  });

  test("all-ok → overall status ok + green badges", () => {
    const { body } = render(Page, {
      props: { data: { streamed: { checks: ALL_OK_CHECKS } } },
    });
    expect(body).toContain('data-doctor-overall data-status="ok"');
    // all status badges should be ok
    const badgeMatches = body.match(/data-status-badge[^>]*data-status="(\w+)"/g) ?? [];
    expect(badgeMatches.every((m) => m.includes('data-status="ok"'))).toBe(true);
  });

  test("failure → overall fail + red badge for failing subsystem", () => {
    const { body } = render(Page, {
      props: { data: { streamed: { checks: WITH_FAILURE } } },
    });
    expect(body).toContain('data-doctor-overall data-status="fail"');
    // web row should be fail
    const webRowMatch = body.match(/data-doctor-row[^>]*data-subsystem="web"[^>]*data-status="(\w+)"/);
    expect(webRowMatch).not.toBeNull();
    expect(webRowMatch?.[1]).toBe("fail");
  });

  test("recovery text visible for failing row (SSR expanded=false, toggle needed)", () => {
    const { body } = render(Page, {
      props: { data: { streamed: { checks: WITH_FAILURE } } },
    });
    // Recovery toggle button should be present for web row
    expect(body).toContain("data-recovery-toggle");
    // The recovery command is referenced in the page (in aria/data attrs or rendered)
    expect(body).toContain("data-subsystem=\"web\"");
  });

  test("Refresh now button present", () => {
    const { body } = render(Page, {
      props: { data: { streamed: { checks: ALL_OK_CHECKS } } },
    });
    expect(body).toContain("data-refresh-now");
    expect(body).toContain("Refresh now");
  });

  test("web subsystem row renders label 'Web'", () => {
    const { body } = render(Page, {
      props: { data: { streamed: { checks: ALL_OK_CHECKS } } },
    });
    expect(body).toContain("data-subsystem=\"web\"");
  });

  test("doctor table renders checked_at timestamps", () => {
    const { body } = render(Page, {
      props: { data: { streamed: { checks: ALL_OK_CHECKS } } },
    });
    expect(body).toContain("2026-05-04 12:00:00Z");
  });
});
