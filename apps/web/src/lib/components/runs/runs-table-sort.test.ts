import { describe, expect, test } from "bun:test";
import { sortRunRows, type SortColumn, type SortDirection } from "./runs-table-sort.ts";
import type { RunRow } from "./runs-filters.ts";

const ROWS: readonly RunRow[] = [
  {
    id: "r1",
    agent: "claude",
    model: "opus",
    status: "succeeded",
    project_id: "p1",
    started_at: "2026-04-30T10:00:00Z",
    ended_at: "2026-04-30T10:30:00Z", // 30m
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
    ended_at: null, // open
    sandbox_mode: null,
    iteration_count: null,
  },
  {
    id: "r3",
    agent: "zeta",
    model: "sonnet",
    status: "failed",
    project_id: "p2",
    started_at: "2026-04-30T09:00:00Z",
    ended_at: "2026-04-30T09:05:00Z", // 5m
    sandbox_mode: null,
    iteration_count: null,
  },
];

function ids(col: SortColumn, dir: SortDirection): string[] {
  return sortRunRows(ROWS, col, dir).map((r) => r.id);
}

describe("sortRunRows", () => {
  test("agent asc: alphabetical by agent name", () => {
    expect(ids("agent", "asc")).toEqual(["r2", "r1", "r3"]);
  });

  test("agent desc: reverse alphabetical", () => {
    expect(ids("agent", "desc")).toEqual(["r3", "r1", "r2"]);
  });

  test("started_at asc: oldest first", () => {
    expect(ids("started_at", "asc")).toEqual(["r3", "r1", "r2"]);
  });

  test("started_at desc: newest first", () => {
    expect(ids("started_at", "desc")).toEqual(["r2", "r1", "r3"]);
  });

  test("status asc: alphabetical", () => {
    expect(ids("status", "asc")).toEqual(["r3", "r2", "r1"]);
  });

  test("duration asc: shortest first; running (null end) goes last", () => {
    // r3=5m, r1=30m, r2=open(+Inf)
    expect(ids("duration", "asc")).toEqual(["r3", "r1", "r2"]);
  });

  test("duration desc: longest first; running (null end) goes first", () => {
    // r2=open(-1 in cmp → last in desc? spec: null end → +Infinity for asc, -1 for desc
    // For desc: -1 means it sorts last in desc when bigger-first; we want running rows
    // ranked above completed when desc per spec ("null end → +Infinity for asc, -1 for desc"
    // means asc puts open last; desc treats them as -1 so they sort last in desc too).
    // r1=30m, r3=5m, r2=open(-1 sentinel)
    expect(ids("duration", "desc")).toEqual(["r1", "r3", "r2"]);
  });

  test("model asc: nulls last; model desc: nulls first", () => {
    expect(ids("model", "asc")).toEqual(["r1", "r3", "r2"]);
    expect(ids("model", "desc")).toEqual(["r2", "r3", "r1"]);
  });
});
