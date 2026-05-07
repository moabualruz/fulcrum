/**
 * Tests for interactive CLI flows (P14 issue 10):
 * - `fulcrum routing rules edit <id>` with $EDITOR YAML
 * - `fulcrum skills conflicts resolve <slug>` interactive + --keep non-interactive
 * - `fulcrum import csv` column-mapping wizard
 * - `--non-interactive` exits 7 (INTERACTIVE_REQUIRED) on all three
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runRoutingRulesEdit,
  runSkillsConflictsResolve,
  runImportCsv,
  INTERACTIVE_REQUIRED_EXIT_CODE,
  type InteractiveFlowOptions,
} from "./interactive-flows.ts";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function harness(overrides: Partial<InteractiveFlowOptions> = {}): {
  captured: string[];
  errors: string[];
  exitCode: number;
  opts: InteractiveFlowOptions;
} {
  const captured: string[] = [];
  const errors: string[] = [];
  let exitCode = 0;
  const opts: InteractiveFlowOptions = {
    print: (line: string) => captured.push(line),
    printErr: (line: string) => errors.push(line),
    exit: (code: number) => { exitCode = code; },
    isTTY: true,
    ...overrides,
  };
  return { captured, errors, get exitCode() { return exitCode; }, opts };
}

// ===========================================================================
// 1. fulcrum routing rules edit <id>
// ===========================================================================

describe("fulcrum routing rules edit (interactive YAML)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "routing-edit-"));
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("EDITOR=cat: writes YAML to temp file, updates rule on exit", async () => {
    const updatedRule = {
      id: "rule-1",
      name: "updated-rule",
      projectId: null,
      conditionsJson: { language: "typescript" },
      actionAgent: "claude",
      actionSkillSet: ["jq"],
      priority: 10,
      enabled: true,
      source: "manual",
    };

    const h = harness({
      editorCmd: "cat",       // $EDITOR override for test
      tmpDir,
      routingCaller: {
        get: async (_id: string) => ({
          id: "rule-1",
          name: "test-rule",
          projectId: null,
          conditionsJson: { language: "python" },
          actionAgent: "codex",
          actionSkillSet: [],
          priority: 5,
          enabled: true,
          source: "manual",
        }),
        update: async (_input) => updatedRule,
      },
    });

    await runRoutingRulesEdit(["rule-1"], h.opts);
    expect(h.exitCode).toBe(0);
    expect(h.captured.some((l) => l.includes("Updated routing rule rule-1"))).toBe(true);
  });

  test("--non-interactive exits INTERACTIVE_REQUIRED (7)", async () => {
    const h = harness({ isTTY: false });
    await runRoutingRulesEdit(["rule-1", "--non-interactive"], h.opts);
    expect(h.exitCode).toBe(INTERACTIVE_REQUIRED_EXIT_CODE);
    expect(h.errors.some((l) => l.includes("INTERACTIVE_REQUIRED"))).toBe(true);
  });

  test("missing <id> exits 1", async () => {
    const h = harness();
    await runRoutingRulesEdit([], h.opts);
    expect(h.exitCode).toBe(1);
  });

  test("--json outputs updated rule as JSON", async () => {
    const updatedRule = {
      id: "rule-1",
      name: "test",
      projectId: null,
      conditionsJson: {},
      actionAgent: "claude",
      actionSkillSet: [],
      priority: 1,
      enabled: true,
      source: "manual",
    };

    const h = harness({
      editorCmd: "cat",
      tmpDir,
      routingCaller: {
        get: async () => updatedRule,
        update: async () => updatedRule,
      },
    });

    await runRoutingRulesEdit(["rule-1", "--json"], h.opts);
    expect(h.exitCode).toBe(0);
    const parsed = JSON.parse(h.captured.join(""));
    expect(parsed.id).toBe("rule-1");
  });
});

// ===========================================================================
// 2. fulcrum skills conflicts resolve <slug>
// ===========================================================================

describe("fulcrum skills conflicts resolve (interactive)", () => {
  test("--keep local: local version preserved, conflict cleared", async () => {
    let resolvedWith: { slug: string; resolution: string } | undefined;

    const h = harness({
      skillsConflictCaller: {
        resolveConflict: async (input) => {
          resolvedWith = input;
          return {
            id: "sk-1",
            name: "jq",
            slug: "jq",
            source: "local",
            upstreamRepo: null,
            upstreamRef: null,
            enabledAgents: ["claude"],
          };
        },
      },
    });

    await runSkillsConflictsResolve(["jq", "--keep", "local"], h.opts);
    expect(h.exitCode).toBe(0);
    expect(resolvedWith?.slug).toBe("jq");
    expect(resolvedWith?.resolution).toBe("local");
    expect(h.captured.some((l) => l.includes("kept local"))).toBe(true);
  });

  test("--keep upstream: upstream version written, conflict cleared", async () => {
    let resolvedWith: { slug: string; resolution: string } | undefined;

    const h = harness({
      skillsConflictCaller: {
        resolveConflict: async (input) => {
          resolvedWith = input;
          return {
            id: "sk-1",
            name: "jq",
            slug: "jq",
            source: "upstream",
            upstreamRepo: null,
            upstreamRef: null,
            enabledAgents: ["claude"],
          };
        },
      },
    });

    await runSkillsConflictsResolve(["jq", "--keep", "upstream"], h.opts);
    expect(h.exitCode).toBe(0);
    expect(resolvedWith?.resolution).toBe("upstream");
  });

  test("--non-interactive without --keep exits INTERACTIVE_REQUIRED (7)", async () => {
    const h = harness({ isTTY: false });
    await runSkillsConflictsResolve(["jq", "--non-interactive"], h.opts);
    expect(h.exitCode).toBe(INTERACTIVE_REQUIRED_EXIT_CODE);
    expect(h.errors.some((l) => l.includes("INTERACTIVE_REQUIRED"))).toBe(true);
  });

  test("--keep local with --non-interactive succeeds (non-interactive path)", async () => {
    const h = harness({
      isTTY: false,
      skillsConflictCaller: {
        resolveConflict: async () => ({
          id: "sk-1",
          name: "jq",
          slug: "jq",
          source: "local",
          upstreamRepo: null,
          upstreamRef: null,
          enabledAgents: ["claude"],
        }),
      },
    });

    await runSkillsConflictsResolve(["jq", "--keep", "local", "--non-interactive"], h.opts);
    expect(h.exitCode).toBe(0);
  });

  test("missing slug exits 1", async () => {
    const h = harness();
    await runSkillsConflictsResolve([], h.opts);
    expect(h.exitCode).toBe(1);
  });
});

// ===========================================================================
// 3. fulcrum import csv
// ===========================================================================

describe("fulcrum import csv (column-mapping wizard)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "import-csv-"));
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("with --map-columns: maps columns and imports", async () => {
    const csvContent = "Name,State,Due\nFix bug,open,2026-01-01\nAdd feat,done,2026-02-01\n";
    const csvPath = join(tmpDir, "tasks.csv");
    await writeFile(csvPath, csvContent, "utf8");

    const h = harness({
      importCaller: {
        importCsv: async (input) => ({
          created: input.rows.length,
          skipped: 0,
          errors: [],
        }),
      },
    });

    await runImportCsv(
      [csvPath, "--map-columns", "title=Name,status=State"],
      h.opts,
    );
    expect(h.exitCode).toBe(0);
    expect(h.captured.some((l) => l.includes("2 created"))).toBe(true);
  });

  test("--non-interactive without --map-columns exits 7", async () => {
    const csvContent = "Name,State\nFix bug,open\n";
    const csvPath = join(tmpDir, "tasks.csv");
    await writeFile(csvPath, csvContent, "utf8");

    const h = harness({ isTTY: false });
    await runImportCsv([csvPath, "--non-interactive"], h.opts);
    expect(h.exitCode).toBe(INTERACTIVE_REQUIRED_EXIT_CODE);
    expect(h.errors.some((l) => l.includes("INTERACTIVE_REQUIRED"))).toBe(true);
  });

  test("missing file path exits 1", async () => {
    const h = harness();
    await runImportCsv([], h.opts);
    expect(h.exitCode).toBe(1);
  });

  test("--json outputs import result as JSON", async () => {
    const csvContent = "title,status\nFix bug,open\n";
    const csvPath = join(tmpDir, "tasks.csv");
    await writeFile(csvPath, csvContent, "utf8");

    const h = harness({
      importCaller: {
        importCsv: async () => ({ created: 1, skipped: 0, errors: [] }),
      },
    });

    await runImportCsv([csvPath, "--map-columns", "title=title,status=status", "--json"], h.opts);
    expect(h.exitCode).toBe(0);
    const parsed = JSON.parse(h.captured.join(""));
    expect(parsed.created).toBe(1);
  });
});
