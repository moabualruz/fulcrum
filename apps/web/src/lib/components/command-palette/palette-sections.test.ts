import { describe, expect, test } from "bun:test";

import {
  PALETTE_SECTION_LABEL,
  PALETTE_SECTION_ORDER,
  RECENT_LIMIT,
  paletteScopeChip,
  resolvePaletteSections,
  stageNavRows,
  stepActionRows,
  type PaletteRow,
  type PaletteScope,
} from "./palette-sections.ts";

/** A populated portfolio-stage Scope with no Step. */
function baseScope(overrides: Partial<PaletteScope> = {}): PaletteScope {
  return {
    workspace: "fulcrum",
    projectId: "auth-rewrite",
    projectLabel: "Auth rewrite",
    stage: "plan",
    step: null,
    traceId: null,
    agent: null,
    ...overrides,
  };
}

const RECENT: PaletteRow[] = [
  { id: "r1", label: "Agent runs", href: "/runs", section: "recent" },
  { id: "r2", label: "Documents", href: "/docs", section: "recent" },
  { id: "r3", label: "Audit", href: "/audit", section: "recent" },
  { id: "r4", label: "Memory", href: "/memory", section: "recent" },
  { id: "r5", label: "Artifacts", href: "/artifacts", section: "recent" },
];

describe("palette section labels (IA-MAP §6 locked copy)", () => {
  test("the eight section labels match IA-MAP §6 verbatim", () => {
    expect(PALETTE_SECTION_LABEL).toEqual({
      recent: "Recent",
      "stage-nav": "Workflow stage nav",
      "project-switcher": "Project switcher",
      "step-actions": "Step actions",
      "federated-search": "Federated search",
      "settings-search": "Settings search",
      "workspace-theme": "Workspace + theme",
      help: "Help",
    });
  });

  test("section order is the IA-MAP §6 sequence", () => {
    expect([...PALETTE_SECTION_ORDER]).toEqual([
      "recent",
      "stage-nav",
      "project-switcher",
      "step-actions",
      "federated-search",
      "settings-search",
      "workspace-theme",
      "help",
    ]);
  });
});

describe("stageNavRows (IA-MAP §6.2)", () => {
  test("emits exactly the six Go to Capture…Operate entries in order", () => {
    const labels = stageNavRows(baseScope()).map((row) => row.label);
    expect(labels).toEqual([
      "Go to Capture",
      "Go to Plan",
      "Go to Build",
      "Go to Review",
      "Go to Ship",
      "Go to Operate",
    ]);
  });

  test("marks the active stage row as current", () => {
    const rows = stageNavRows(baseScope({ stage: "build" }));
    const build = rows.find((row) => row.id === "stage-build");
    expect(build?.description).toBe("current stage");
    expect(rows.find((row) => row.id === "stage-plan")?.description).toBeUndefined();
  });
});

describe("stepActionRows (IA-MAP §6.4: Step-only)", () => {
  test("returns no rows when no Step is in scope", () => {
    expect(stepActionRows(baseScope())).toEqual([]);
  });

  test("surfaces Play / Discuss / Open in AI Assist / Copy trace ID / Open in audit", () => {
    const rows = stepActionRows(
      baseScope({
        traceId: "tr_8f29a4c1b3e0d5f7",
        step: {
          stepId: "AUTH-3",
          kind: "task-card",
          title: "Persist issuance row per kid",
          index: 3,
          total: 8,
        },
      }),
    );
    const ids = rows.map((row) => row.id);
    expect(ids).toEqual([
      "step-play",
      "step-discuss",
      "step-assist",
      "step-copy-trace",
      "step-open-audit",
    ]);
    expect(rows[0].label).toBe("Play step 3: Persist issuance row per kid");
    expect(rows[2].label).toBe("Open in AI Assist drawer");
    expect(rows.find((row) => row.id === "step-copy-trace")?.description).toBe(
      "tr_8f29a4c1b3e0d5f7",
    );
  });

  test("omits Copy trace ID when no trace is in scope", () => {
    const rows = stepActionRows(
      baseScope({ step: { stepId: "AUTH-3", kind: "task-card", title: "Step" } }),
    );
    expect(rows.find((row) => row.id === "step-copy-trace")).toBeUndefined();
  });
});

describe("resolvePaletteSections", () => {
  test("renders sections in IA-MAP §6 order and omits Step actions without a Step", () => {
    const sections = resolvePaletteSections({ scope: baseScope(), recent: RECENT });
    const ids = sections.map((section) => section.id);
    expect(ids).toEqual([
      "recent",
      "stage-nav",
      "project-switcher",
      // step-actions omitted: no Step in scope
      "workspace-theme",
      "help",
    ]);
    // every present section keeps the canonical relative order
    const order = [...PALETTE_SECTION_ORDER];
    expect(ids).toEqual(ids.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  });

  test("inserts Step actions between Project switcher and Federated search when a Step is scoped", () => {
    const sections = resolvePaletteSections({
      scope: baseScope({
        traceId: "tr_x",
        step: { stepId: "AUTH-3", kind: "task-card", title: "Step", index: 3, total: 8 },
      }),
      recent: RECENT,
    });
    const ids = sections.map((section) => section.id);
    expect(ids.indexOf("step-actions")).toBeGreaterThan(ids.indexOf("project-switcher"));
    expect(ids.includes("step-actions")).toBe(true);
  });

  test("caps the Recent section at 4 frecency entries", () => {
    const sections = resolvePaletteSections({ scope: baseScope(), recent: RECENT });
    const recent = sections.find((section) => section.id === "recent");
    expect(recent?.rows.length).toBe(RECENT_LIMIT);
  });

  test("is Scope-aware: the project switcher follows the active project", () => {
    const alpha = resolvePaletteSections({ scope: baseScope({ projectId: "alpha", projectLabel: "Alpha" }) });
    const beta = resolvePaletteSections({ scope: baseScope({ projectId: "beta", projectLabel: "Beta" }) });
    const alphaCurrent = alpha
      .find((section) => section.id === "project-switcher")
      ?.rows.find((row) => row.description === "current project");
    const betaCurrent = beta
      .find((section) => section.id === "project-switcher")
      ?.rows.find((row) => row.description === "current project");
    expect(alphaCurrent?.label).toBe("Alpha");
    expect(betaCurrent?.label).toBe("Beta");
  });

  test("federated-search section appears only when hits are supplied", () => {
    const withHits = resolvePaletteSections({
      scope: baseScope(),
      federatedHits: [{ id: "d1", title: "Runbook", kind: "doc", href: "/docs/d1" }],
    });
    expect(withHits.some((section) => section.id === "federated-search")).toBe(true);
    const withoutHits = resolvePaletteSections({ scope: baseScope() });
    expect(withoutHits.some((section) => section.id === "federated-search")).toBe(false);
  });
});

describe("paletteScopeChip (DESIGN.md §4.12 active-context chip)", () => {
  test("renders stage, project, step, and agent into one unambiguous string", () => {
    const chip = paletteScopeChip(
      baseScope({
        projectLabel: "Auth rewrite",
        agent: "claude-opus-4.7",
        step: { stepId: "AUTH-3", kind: "task-card", title: "Persist issuance row", index: 3, total: 8 },
      }),
    );
    expect(chip).toContain("Plan");
    expect(chip).toContain("Auth rewrite");
    expect(chip).toContain("Persist issuance row 3/8");
    expect(chip).toContain("claude-opus-4.7");
  });

  test("changes with the Scope tuple", () => {
    expect(paletteScopeChip(baseScope({ stage: "build" }))).not.toBe(
      paletteScopeChip(baseScope({ stage: "ship" })),
    );
  });
});
