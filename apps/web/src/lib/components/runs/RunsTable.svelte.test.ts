import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import type { RunRow } from "./runs-filters.ts";
import type { SortColumn, SortDirection } from "./runs-table-sort.ts";

type RunsTableProps = {
  rows: RunRow[];
  sort?: { column: SortColumn; direction: SortDirection };
};

const ROWS: RunRow[] = [
  {
    id: "r1",
    agent: "claude",
    model: "opus",
    status: "succeeded",
    project_id: "p1",
    started_at: "2026-04-30T10:00:00Z",
    ended_at: "2026-04-30T10:30:00Z",
    sandbox_mode: null,
    iteration_count: null,
  },
  {
    id: "r2",
    agent: "alpha",
    model: null,
    status: "running",
    project_id: null,
    started_at: "2026-04-30T11:00:00Z",
    ended_at: null,
    sandbox_mode: "strict",
    iteration_count: 3,
  },
  {
    id: "r3",
    agent: "zeta",
    model: "sonnet",
    status: "failed",
    project_id: "p2",
    started_at: "2026-04-30T09:00:00Z",
    ended_at: "2026-04-30T09:05:00Z",
    sandbox_mode: null,
    iteration_count: null,
  },
];

describe("RunsTable component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let RunsTable: Component<RunsTableProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./RunsTable.svelte")) as {
      default: Component<RunsTableProps>;
    };
    RunsTable = mod.default;
  });

  test("renders header buttons with data-runs-sort for each column", () => {
    const { body } = render(RunsTable, { props: { rows: ROWS } });
    for (const col of ["agent", "model", "status", "sandbox_mode", "iteration_count", "started_at", "duration"]) {
      expect(body).toContain(`data-runs-sort="${col}"`);
    }
  });

  test("renders three rows in passed order when no sort applied", () => {
    const { body } = render(RunsTable, { props: { rows: ROWS } });
    const rowMatches = body.match(/data-runs-row[^>]*data-run-id="([^"]+)"/g) ?? [];
    expect(rowMatches).toHaveLength(3);
    expect(rowMatches[0]).toContain('data-run-id="r1"');
    expect(rowMatches[1]).toContain('data-run-id="r2"');
    expect(rowMatches[2]).toContain('data-run-id="r3"');
  });

  test("rows reorder when sort=started_at asc", () => {
    const { body } = render(RunsTable, {
      props: {
        rows: ROWS,
        sort: { column: "started_at", direction: "asc" },
      },
    });
    const rowMatches = body.match(/data-runs-row[^>]*data-run-id="([^"]+)"/g) ?? [];
    expect(rowMatches).toHaveLength(3);
    // started_at asc → r3 (09:00) → r1 (10:00) → r2 (11:00)
    expect(rowMatches[0]).toContain('data-run-id="r3"');
    expect(rowMatches[1]).toContain('data-run-id="r1"');
    expect(rowMatches[2]).toContain('data-run-id="r2"');
  });

  test("sort indicator data-runs-sort-direction present on active column only", () => {
    const { body } = render(RunsTable, {
      props: {
        rows: ROWS,
        sort: { column: "started_at", direction: "asc" },
      },
    });
    const indicators = body.match(/data-runs-sort-direction/g) ?? [];
    expect(indicators).toHaveLength(1);
    // arrow appears for asc
    expect(body).toMatch(/data-runs-sort-direction[^>]*>\s*↑/);
  });

  test("each row links to /runs/<id> via data-runs-row-link", () => {
    const { body } = render(RunsTable, { props: { rows: ROWS } });
    for (const row of ROWS) {
      const re = new RegExp(`data-runs-row-link[^>]*href="/runs/${row.id}"`);
      expect(body).toMatch(re);
    }
  });
});
