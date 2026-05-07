import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

type RunRow = {
  id: string;
  agent: string;
  status: string;
  started_at: string;
  ended_at: string | null;
};

type RecentRunsProps = {
  runs: RunRow[];
};

const SAMPLE_RUNS: RunRow[] = [
  { id: "r1", agent: "claude", status: "succeeded", started_at: "2026-04-30T10:00:00Z", ended_at: "2026-04-30T10:30:00Z" },
  { id: "r2", agent: "codex", status: "running", started_at: "2026-04-30T11:00:00Z", ended_at: null },
  { id: "r3", agent: "gemini", status: "failed", started_at: "2026-04-30T09:00:00Z", ended_at: "2026-04-30T09:05:00Z" },
];

describe("RecentRuns component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let RecentRuns: Component<RecentRunsProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./RecentRuns.svelte")) as {
      default: Component<RecentRunsProps>;
    };
    RecentRuns = mod.default;
  });

  test("3 rows yield 3 li[data-recent-run]", () => {
    const { body } = render(RecentRuns, { props: { runs: SAMPLE_RUNS } });
    const matches = body.match(/data-recent-run\b/g) ?? [];
    expect(matches).toHaveLength(3);
  });

  test("empty array yields data-recent-runs-empty", () => {
    const { body } = render(RecentRuns, { props: { runs: [] } });
    expect(body).toContain("data-recent-runs-empty");
    expect(body).not.toContain("data-recent-run\"");
  });

  test("rows include <a href='/runs/<id>'>", () => {
    const { body } = render(RecentRuns, { props: { runs: SAMPLE_RUNS } });
    for (const run of SAMPLE_RUNS) {
      expect(body).toContain(`href="/runs/${run.id}"`);
    }
  });

  test("renders section with data-recent-runs and h3 'Recent runs'", () => {
    const { body } = render(RecentRuns, { props: { runs: SAMPLE_RUNS } });
    expect(body).toContain("data-recent-runs");
    expect(body).toMatch(/<h3\b[^>]*>\s*Recent runs\s*<\/h3>/);
  });
});
