import { describe, expect, test } from "bun:test";
import { ROOT_HELP, STAGE_HELP_TOPICS, renderStageHelp } from "../../apps/cli/src/index.ts";

/**
 * Snapshot + assertion coverage for the workflow-stage CLI help tree
 * (prd-cli-stage-command-tree).
 *
 * `fulcrum --help` must group commands by the six product workflow stages plus
 * AI Assist and a Cross-cutting / Global group, so a CLI user shares one mental
 * model with the web and TUI surfaces (CLI-TUI-UX.md §1; PRODUCT.md hard
 * invariant 7). The snapshot pins the rendered help; the explicit assertions
 * prove the stage grouping is load-bearing, not incidental text.
 */

/** The six workflow stages plus AI Assist, as they head the root help. */
const STAGE_HEADINGS = [
  "CAPTURE",
  "PLAN",
  "BUILD",
  "REVIEW",
  "SHIP",
  "OPERATE",
  "AI ASSIST",
] as const;

describe("fulcrum --help workflow-stage command tree", () => {
  test("root help snapshot is stable", () => {
    expect(ROOT_HELP).toMatchSnapshot();
  });

  test("root help groups commands by every workflow stage plus AI Assist", () => {
    for (const heading of STAGE_HEADINGS) {
      expect(ROOT_HELP).toContain(`${heading}\n`);
    }
  });

  test("root help exposes a Cross-cutting / Global group for non-stage commands", () => {
    expect(ROOT_HELP).toContain("CROSS-CUTTING / GLOBAL");
    // web / tui / version / help / completion live in the global group.
    expect(ROOT_HELP).toContain("fulcrum web");
    expect(ROOT_HELP).toContain("fulcrum tui");
    expect(ROOT_HELP).toContain("fulcrum version");
    expect(ROOT_HELP).toContain("fulcrum completion");
  });

  test("root help mentions the --json machine envelope", () => {
    expect(ROOT_HELP).toContain("--json");
    expect(ROOT_HELP).toContain("fulcrum.cli.v1");
  });

  test("root help uses no foundation-era primary identity copy", () => {
    expect(ROOT_HELP).not.toContain("multi-agent foundation CLI");
    expect(ROOT_HELP).not.toContain("foundation CLI");
    // The product identity is the workflow-stage Agent OS.
    expect(ROOT_HELP).toContain("local-first CLI Agent OS");
  });

  test("compatibility command names still resolve from the stage tree", () => {
    // Existing flat command names keep working: they appear under the stage
    // that now owns them, so scripts that call them are not orphaned.
    expect(ROOT_HELP).toContain("fulcrum task|tasks");
    expect(ROOT_HELP).toContain("fulcrum work <create|inspect|move|link|report>");
    expect(ROOT_HELP).toContain("fulcrum runs <list|show|cancel|retry");
    expect(ROOT_HELP).toContain("fulcrum doctor");
    expect(ROOT_HELP).toContain("fulcrum inference <start|status|embed|generate|stop>");
  });
});

describe("fulcrum help <stage> per-stage detail", () => {
  test("build stage help snapshot is stable", () => {
    expect(renderStageHelp("build")).toMatchSnapshot();
  });

  test("build stage help includes commands, examples, and --json mention", () => {
    const help = renderStageHelp("build");
    expect(help).not.toBeNull();
    expect(help).toContain("Build stage");
    expect(help).toContain("Commands:");
    expect(help).toContain("Examples:");
    expect(help).toContain("fulcrum task list --status open --json");
    expect(help).toContain("--json");
  });

  test("every workflow stage topic resolves with an Examples section", () => {
    for (const topic of ["capture", "plan", "build", "review", "ship", "operate", "ai"]) {
      const help = renderStageHelp(topic);
      expect(help, `stage help for ${topic}`).not.toBeNull();
      expect(help, `examples for ${topic}`).toContain("Examples:");
      expect(help, `--json mention for ${topic}`).toContain("--json");
    }
  });

  test("unknown stage topic returns null", () => {
    expect(renderStageHelp("nonsense")).toBeNull();
  });

  test("STAGE_HELP_TOPICS covers the six stages, AI Assist, and the global group", () => {
    expect(STAGE_HELP_TOPICS).toEqual([
      "capture",
      "plan",
      "build",
      "review",
      "ship",
      "operate",
      "ai",
      "cross-cutting",
    ]);
  });
});
