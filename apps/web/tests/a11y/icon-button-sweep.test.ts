/**
 * Icon-only button aria-label sweep — Task 08.6
 *
 * For every rendered route, assert that each <button> whose visible text is
 * empty or a single non-alphanumeric symbol carries a non-empty aria-label.
 * Catches future icon-only regressions (×, ☰, lucide SVGs, etc.).
 */

import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import { mockSvelteKitRoute } from "./runs-helpers";

// ---------------------------------------------------------------------------
// Sweep helpers
// ---------------------------------------------------------------------------

function extractButtons(html: string): Array<{ attrs: string; body: string }> {
  const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  const out: Array<{ attrs: string; body: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push({ attrs: m[1] ?? "", body: m[2] ?? "" });
  return out;
}

function plainText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, "·") // entity → placeholder char
    .trim();
}

/** Empty body, or single non-letter/non-digit character (×, ☰, ·, ↑, emoji…) */
function isIconOnly(text: string): boolean {
  if (text === "") return true;
  return text.length === 1 && !/[\p{L}\p{N}]/u.test(text);
}

function hasAriaLabel(attrs: string): boolean {
  const m = attrs.match(/\baria-label(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/i);
  return m !== null && (m[1] ?? m[2] ?? m[3] ?? "").trim() !== "";
}

interface Violation { route: string; attrs: string; text: string }

function sweep(route: string, html: string): Violation[] {
  return extractButtons(html)
    .filter((b) => isIconOnly(plainText(b.body)) && !hasAriaLabel(b.attrs))
    .map((b) => ({ route, attrs: b.attrs.trim().slice(0, 120), text: plainText(b.body) }));
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

mockSvelteKitRoute("/");

const dashboard = {
  counters: { projects: 1, openTasks: 2, docs: 3, runsLast7d: 4 },
  recentRuns: [{ id: "r1", agent: "codex", status: "succeeded", started_at: "2026-04-30T10:00:00Z", ended_at: null }],
  recentDocs: [{ id: "d1", title: "Note", kind: "note", updated_at: "2026-04-30T12:00:00Z" }],
  topTasks: [{ id: "t1", title: "Review", status: "pending", priority: 2, project_id: "alpha" }],
};

const runs = [{
  id: "r1", agent: "codex", model: "gpt-5", status: "running" as const,
  project_id: "alpha", started_at: "2026-04-30T11:00:00Z", ended_at: null,
}];

const tasks = [
  { id: "t1", title: "Pending one",     status: "pending",     priority: 0, project_id: "alpha", updated_at: "2026-04-30T01:00:00Z" },
  { id: "t2", title: "In progress one", status: "in_progress", priority: 1, project_id: null,    updated_at: "2026-04-29T02:00:00Z" },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("icon-button aria-label sweep", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let render: typeof import("svelte/server").render;
  let DashPage: Component<{ data: { activeProjectId: string | null; streamed: { dashboard: Promise<typeof dashboard> } } }>;
  let RunsPage: Component<{
    data: {
      activeProjectId: string | null;
      filter: { agent: string; status: string; range: string; project: string };
      streamed: { data: Promise<{ runs: typeof runs }> };
    };
  }>;
  let BoardsPage: Component<{
    data: {
      project: string;
      activeProjectId: string | null;
      streamed: { data: Promise<{ tasks: typeof tasks }> | { tasks: typeof tasks } };
    };
  }>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    ({ default: DashPage }   = await import("../../src/routes/+page.svelte") as { default: typeof DashPage });
    ({ default: RunsPage }   = await import("../../src/routes/runs/+page.svelte") as { default: typeof RunsPage });
    ({ default: BoardsPage } = await import("../../src/routes/boards/+page.svelte") as { default: typeof BoardsPage });
  });

  test("dashboard — no unlabelled icon-only buttons", () => {
    const { body } = render(DashPage, {
      props: { data: { activeProjectId: null, streamed: { dashboard: Promise.resolve(dashboard) } } },
    });
    expect(sweep("/", body)).toEqual([]);
  });

  test("runs list — no unlabelled icon-only buttons", () => {
    const { body } = render(RunsPage, {
      props: {
        data: {
          activeProjectId: null,
          filter: { agent: "", status: "", range: "all", project: "__any__" },
          streamed: { data: Promise.resolve({ runs }) },
        },
      },
    });
    expect(sweep("/runs", body)).toEqual([]);
  });

  test("boards — no unlabelled icon-only buttons", () => {
    const { body } = render(BoardsPage, {
      props: {
        data: {
          project: "",
          activeProjectId: null,
          streamed: { data: { tasks } },
        },
      },
    });
    expect(sweep("/boards", body)).toEqual([]);
  });
});
