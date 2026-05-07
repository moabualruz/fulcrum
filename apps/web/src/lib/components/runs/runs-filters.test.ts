import { describe, expect, test } from "bun:test";
import {
  applyRunsFilters,
  type RunRow,
  type RunsFilterState,
} from "./runs-filters.ts";

const now = new Date("2026-04-30T12:00:00Z");

const rows: readonly RunRow[] = [
  // 1h ago — within 24h
  {
    id: "r1",
    agent: "claude",
    model: "opus",
    status: "succeeded",
    project_id: "proj-a",
    started_at: "2026-04-30T11:00:00Z",
    ended_at: "2026-04-30T11:30:00Z",
    sandbox_mode: null,
    iteration_count: null,
  },
  // 2 days ago — within 7d but outside 24h
  {
    id: "r2",
    agent: "codex",
    model: "gpt-5",
    status: "failed",
    project_id: "proj-b",
    started_at: "2026-04-28T12:00:00Z",
    ended_at: "2026-04-28T12:10:00Z",
    sandbox_mode: null,
    iteration_count: null,
  },
  // 10 days ago — within 30d but outside 7d
  {
    id: "r3",
    agent: "claude",
    model: "sonnet",
    status: "running",
    project_id: null,
    started_at: "2026-04-20T12:00:00Z",
    ended_at: null,
    sandbox_mode: null,
    iteration_count: null,
  },
  // 60 days ago — outside 30d
  {
    id: "r4",
    agent: "gemini",
    model: "pro",
    status: "queued",
    project_id: "proj-a",
    started_at: "2026-03-01T12:00:00Z",
    ended_at: null,
    sandbox_mode: null,
    iteration_count: null,
  },
];

function ids(filter: RunsFilterState): string[] {
  return applyRunsFilters(rows, filter, now).map((r) => r.id);
}

describe("applyRunsFilters", () => {
  test("agent filter narrows by exact agent name", () => {
    expect(ids({ agent: "claude", range: "all" })).toEqual(["r1", "r3"]);
  });

  test("status filter narrows by exact status", () => {
    expect(ids({ status: "failed", range: "all" })).toEqual(["r2"]);
  });

  test("project filter narrows by exact project id", () => {
    expect(ids({ project: "proj-a", range: "all" })).toEqual(["r1", "r4"]);
  });

  test("range=24h drops rows older than 24h", () => {
    expect(ids({ range: "24h" })).toEqual(["r1"]);
  });

  test("range=7d keeps rows within last 7 days", () => {
    expect(ids({ range: "7d" })).toEqual(["r1", "r2"]);
  });

  test("range=30d keeps rows within last 30 days", () => {
    expect(ids({ range: "30d" })).toEqual(["r1", "r2", "r3"]);
  });

  test("range=all keeps every row", () => {
    expect(ids({ range: "all" })).toEqual(["r1", "r2", "r3", "r4"]);
  });

  test("composed agent+status+range narrows deterministically", () => {
    expect(
      ids({ agent: "claude", status: "succeeded", range: "24h" }),
    ).toEqual(["r1"]);
  });
});
