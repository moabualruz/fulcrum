#!/usr/bin/env bun
/**
 * TDD tests for scripts/gen-conformance-trace.ts
 *
 * P3#15: conformance trace doc + hash gate
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  requiredConformanceItems,
  renderTrace,
  scanExportedFunctions,
  buildFunctionSpecMapping,
  FUNCTION_SPEC_MAP,
  generateLockHash,
} from "./gen-conformance-trace.ts";

// ---------------------------------------------------------------------------
// requiredConformanceItems — existing tests kept
// ---------------------------------------------------------------------------
describe("requiredConformanceItems", () => {
  it("extracts REQUIRED items from SPEC.md 18.1 section", () => {
    const spec = [
      "### 18.1 REQUIRED for Conformance",
      "",
      "- Workflow path selection supports explicit runtime path and cwd default",
      "- Polling orchestrator with single-authority mutable state",
      "",
      "### 18.2 RECOMMENDED",
    ].join("\n");

    const items = requiredConformanceItems(spec);
    expect(items).toHaveLength(2);
    expect(items[0]).toBe("Workflow path selection supports explicit runtime path and cwd default");
    expect(items[1]).toBe("Polling orchestrator with single-authority mutable state");
  });

  it("throws when 18.1 section missing", () => {
    expect(() => requiredConformanceItems("# No conformance")).toThrow("SPEC.md missing");
  });

  it("throws when checklist is empty", () => {
    const spec = "### 18.1 REQUIRED for Conformance\n\n### 18.2 RECOMMENDED\n";
    expect(() => requiredConformanceItems(spec)).toThrow("no REQUIRED items");
  });
});

// ---------------------------------------------------------------------------
// scanExportedFunctions — NEW: scans TS files for exported function names
// ---------------------------------------------------------------------------
describe("scanExportedFunctions", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "gen-trace-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("extracts exported function names from a TS file", () => {
    const file = join(tmpDir, "test.ts");
    writeFileSync(
      file,
      `export function foo() {}\nexport async function bar() {}\nfunction baz() {}\nexport const QUX = 1;\n`,
    );
    const fns = scanExportedFunctions(file);
    expect(fns).toContain("foo");
    expect(fns).toContain("bar");
    expect(fns).not.toContain("baz"); // not exported
  });

  it("extracts exported class names", () => {
    const file = join(tmpDir, "err.ts");
    writeFileSync(file, `export class HookTimeoutError extends Error {}\n`);
    const fns = scanExportedFunctions(file);
    expect(fns).toContain("HookTimeoutError");
  });

  it("returns empty array for file with no exports", () => {
    const file = join(tmpDir, "empty.ts");
    writeFileSync(file, `const x = 1;\n`);
    expect(scanExportedFunctions(file)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildFunctionSpecMapping — maps scanned exports to SPEC sections
// ---------------------------------------------------------------------------
describe("buildFunctionSpecMapping", () => {
  it("maps known functions to their SPEC sections", () => {
    const mapping = buildFunctionSpecMapping({
      "orchestrator.ts": ["claimRun", "dispatchRunWithHooks", "startSymphonyOrchestrator"],
      "tracker.ts": ["fetchCandidateIssues", "fetchIssuesByStates"],
      "hooks.ts": ["dispatchLifecycleHook"],
      "workspace.ts": ["sanitizeWorkspaceKey"],
      "prompt.ts": ["renderPrompt", "parseWorkflowConfig"],
      "retry.ts": ["calcRetryDelay", "scheduleRetry"],
    });

    // Every mapped function should have a SPEC section
    expect(mapping.length).toBeGreaterThan(0);
    for (const row of mapping) {
      expect(row.file).toBeTruthy();
      expect(row.fn).toBeTruthy();
      expect(row.specSection).toBeTruthy();
    }
  });

  it("returns empty for functions not in the config table", () => {
    const mapping = buildFunctionSpecMapping({
      "orchestrator.ts": ["unknownFn123"],
    });
    // unknownFn123 should not appear in the mapping
    expect(mapping.find((r) => r.fn === "unknownFn123")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// FUNCTION_SPEC_MAP — config table completeness
// ---------------------------------------------------------------------------
describe("FUNCTION_SPEC_MAP", () => {
  it("covers all six core files", () => {
    const files = new Set(Object.values(FUNCTION_SPEC_MAP).map((v) => v.file));
    expect(files).toContain("orchestrator.ts");
    expect(files).toContain("tracker.ts");
    expect(files).toContain("hooks.ts");
    expect(files).toContain("workspace.ts");
    expect(files).toContain("prompt.ts");
    expect(files).toContain("retry.ts");
  });
});

// ---------------------------------------------------------------------------
// renderTrace — includes function→SPEC mapping table
// ---------------------------------------------------------------------------
describe("renderTrace", () => {
  it("includes the function mapping table", () => {
    const items = ["Polling orchestrator with single-authority mutable state"];
    const functionMap = [
      { file: "orchestrator.ts", fn: "claimRun", specSection: "§Claim Lock" },
    ];
    const output = renderTrace(items, functionMap);
    expect(output).toContain("## Function → SPEC Mapping");
    expect(output).toContain("orchestrator.ts");
    expect(output).toContain("claimRun");
    expect(output).toContain("§Claim Lock");
  });

  it("renders markdown table with headers", () => {
    const output = renderTrace([], [
      { file: "retry.ts", fn: "calcRetryDelay", specSection: "§Retry" },
    ]);
    expect(output).toContain("| File | Function | SPEC Section |");
    expect(output).toContain("|---|---|---|");
  });
});

// ---------------------------------------------------------------------------
// generateLockHash — SHA-256 of generated doc
// ---------------------------------------------------------------------------
describe("generateLockHash", () => {
  it("returns 64-char hex string", () => {
    const hash = generateLockHash("some content");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when content changes", () => {
    const h1 = generateLockHash("content A");
    const h2 = generateLockHash("content B");
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// Integration: removing a mapped function changes the hash
// ---------------------------------------------------------------------------
describe("hash gate integration", () => {
  it("removing a mapped export changes the lock hash", () => {
    const fullExports = {
      "orchestrator.ts": ["claimRun", "dispatchRunWithHooks", "startSymphonyOrchestrator"],
      "tracker.ts": ["fetchCandidateIssues", "fetchIssuesByStates", "fetchIssueStatesByIds"],
      "hooks.ts": ["dispatchLifecycleHook", "HookTimeoutError", "resolveHookTimeoutMs"],
      "workspace.ts": ["sanitizeWorkspaceKey", "createWorkspace", "destroyWorkspace", "getWorkspacePath", "workspaceRoot"],
      "prompt.ts": ["renderPrompt", "parseWorkflowConfig", "loadWorkflowDef", "UnknownVariableError"],
      "retry.ts": ["calcRetryDelay", "scheduleRetry"],
    };

    const items = ["Polling orchestrator with single-authority mutable state"];
    const map1 = buildFunctionSpecMapping(fullExports);
    const doc1 = renderTrace(items, map1);
    const hash1 = generateLockHash(doc1);

    // Remove claimRun from orchestrator exports
    const reducedExports = {
      ...fullExports,
      "orchestrator.ts": ["dispatchRunWithHooks", "startSymphonyOrchestrator"],
    };
    const map2 = buildFunctionSpecMapping(reducedExports);
    const doc2 = renderTrace(items, map2);
    const hash2 = generateLockHash(doc2);

    expect(hash1).not.toBe(hash2);
  });
});
