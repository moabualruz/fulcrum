/**
 * PR 16 unit 16.1 — install-journal.ts TDD tests.
 *
 * Tests appendJournal(), readJournal(), clearJournal(), globalStateDir(),
 * and journalPath() for both global (per-agent file) and project (single
 * file) scopes.
 *
 * ALL project-scoped agent calls pass an explicit `targetDir` — never rely
 * on process.cwd() defaults, which would pollute the repo working tree.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  appendJournal,
  readJournal,
  clearJournal,
  globalStateDir,
  journalPath,
  type InstallJournalEntry,
} from "../install-journal.js";

function mktemp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "journal-test-"));
}

function baseEntry(overrides: Partial<InstallJournalEntry> = {}): InstallJournalEntry {
  return {
    ts: "2026-04-21T00:00:00.000Z",
    agent: "opencode",
    step_name: "opencode: .opencode/opencode.jsonc",
    action: "write_file",
    target_path: "/tmp/fake/.opencode/opencode.jsonc",
    rollback: "rm /tmp/fake/.opencode/opencode.jsonc",
    mode: "native",
    install_run_id: "run-001",
    ...overrides,
  };
}

// ── globalStateDir() ──────────────────────────────────────────────────────────

describe("globalStateDir", () => {
  const origXdg = process.env["XDG_STATE_HOME"];
  const origFulcrum = process.env["FULCRUM_STATE_DIR"];

  afterEach(() => {
    if (origXdg === undefined) delete process.env["XDG_STATE_HOME"];
    else process.env["XDG_STATE_HOME"] = origXdg;
    if (origFulcrum === undefined) delete process.env["FULCRUM_STATE_DIR"];
    else process.env["FULCRUM_STATE_DIR"] = origFulcrum;
  });

  it("respects XDG_STATE_HOME when set", () => {
    delete process.env["FULCRUM_STATE_DIR"];
    process.env["XDG_STATE_HOME"] = "/custom/state";
    expect(globalStateDir()).toBe("/custom/state/fulcrum");
  });

  it("falls back to ~/.local/state/fulcrum when XDG_STATE_HOME unset", () => {
    delete process.env["XDG_STATE_HOME"];
    delete process.env["FULCRUM_STATE_DIR"];
    expect(globalStateDir()).toBe(path.join(os.homedir(), ".local", "state", "fulcrum"));
  });

  it("respects FULCRUM_STATE_DIR override (highest priority)", () => {
    process.env["FULCRUM_STATE_DIR"] = "/my/state";
    expect(globalStateDir()).toBe("/my/state");
  });
});

// ── journalPath() ─────────────────────────────────────────────────────────────

describe("journalPath", () => {
  const origXdg = process.env["XDG_STATE_HOME"];
  const origFulcrum = process.env["FULCRUM_STATE_DIR"];

  beforeEach(() => {
    delete process.env["FULCRUM_STATE_DIR"];
    process.env["XDG_STATE_HOME"] = "/state";
  });
  afterEach(() => {
    if (origXdg === undefined) delete process.env["XDG_STATE_HOME"];
    else process.env["XDG_STATE_HOME"] = origXdg;
    if (origFulcrum === undefined) delete process.env["FULCRUM_STATE_DIR"];
    else process.env["FULCRUM_STATE_DIR"] = origFulcrum;
  });

  it("global-scoped agents use XDG state dir with per-agent filename", () => {
    const p = journalPath("claude");
    expect(p).toBe("/state/fulcrum/install/claude.jsonl");
  });

  it("project-scoped agents use .fulcrum/install.jsonl in targetDir", () => {
    const p = journalPath("cursor", "/my/project");
    expect(p).toBe("/my/project/.fulcrum/install.jsonl");
  });

  it("global agents: gemini path uses per-agent file", () => {
    const p = journalPath("gemini");
    expect(p).toBe("/state/fulcrum/install/gemini.jsonl");
  });

  it("global agents: qwen path uses per-agent file", () => {
    const p = journalPath("qwen");
    expect(p).toBe("/state/fulcrum/install/qwen.jsonl");
  });
});

// ── appendJournal() + readJournal() (global-scoped) ──────────────────────────

describe("appendJournal + readJournal — global agents", () => {
  let stateDir: string;
  const origFulcrum = process.env["FULCRUM_STATE_DIR"];

  beforeEach(() => {
    stateDir = mktemp();
    process.env["FULCRUM_STATE_DIR"] = stateDir;
  });

  afterEach(() => {
    fs.rmSync(stateDir, { recursive: true, force: true });
    if (origFulcrum === undefined) delete process.env["FULCRUM_STATE_DIR"];
    else process.env["FULCRUM_STATE_DIR"] = origFulcrum;
  });

  it("appends a valid JSONL entry for a global agent and reads it back", () => {
    const entry = baseEntry({ agent: "claude" });
    appendJournal(entry);
    const rows = readJournal("claude");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject(entry);
  });

  it("multiple append calls produce ordered rows", () => {
    appendJournal(baseEntry({ agent: "claude", step_name: "step-A", install_run_id: "r1" }));
    appendJournal(baseEntry({ agent: "claude", step_name: "step-B", install_run_id: "r1" }));
    appendJournal(baseEntry({ agent: "claude", step_name: "step-C", install_run_id: "r1" }));
    const rows = readJournal("claude");
    expect(rows.map(r => r.step_name)).toEqual(["step-A", "step-B", "step-C"]);
  });

  it("readJournal returns empty array for unknown agent", () => {
    expect(readJournal("gemini")).toHaveLength(0);
  });

  it("creates parent directories on first write", () => {
    const entry = baseEntry({ agent: "pi" });
    appendJournal(entry);
    const rows = readJournal("pi");
    expect(rows).toHaveLength(1);
  });

  it("preserves optional sha256_before + sha256_after fields", () => {
    const entry = baseEntry({
      agent: "claude",
      action: "merge_json",
      sha256_before: "abc123",
      sha256_after: "def456",
    });
    appendJournal(entry);
    const rows = readJournal("claude");
    expect(rows[0]!.sha256_before).toBe("abc123");
    expect(rows[0]!.sha256_after).toBe("def456");
  });
});

// ── project-scoped journal ────────────────────────────────────────────────────

describe("project-scoped journal", () => {
  let projectDir: string;
  let stateDir: string;
  const origFulcrum = process.env["FULCRUM_STATE_DIR"];

  beforeEach(() => {
    projectDir = mktemp();
    stateDir = mktemp();
    process.env["FULCRUM_STATE_DIR"] = stateDir;
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
    if (origFulcrum === undefined) delete process.env["FULCRUM_STATE_DIR"];
    else process.env["FULCRUM_STATE_DIR"] = origFulcrum;
  });

  it("writes to .fulcrum/install.jsonl in targetDir", () => {
    const entry = baseEntry({ agent: "cursor" });
    appendJournal(entry, projectDir);
    const journalFile = path.join(projectDir, ".fulcrum", "install.jsonl");
    expect(fs.existsSync(journalFile)).toBe(true);
  });

  it("readJournal with targetDir reads from .fulcrum/install.jsonl", () => {
    const entry = baseEntry({ agent: "cursor", step_name: "cursor-mcp" });
    appendJournal(entry, projectDir);
    const rows = readJournal("cursor", projectDir);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.step_name).toBe("cursor-mcp");
  });

  it("global journal path not polluted by project writes", () => {
    appendJournal(baseEntry({ agent: "cursor" }), projectDir);
    // global stateDir for cursor would be at stateDir/install/cursor.jsonl
    // (but cursor is project-scoped so no such file is created)
    const globalPath = path.join(stateDir, "install", "cursor.jsonl");
    expect(fs.existsSync(globalPath)).toBe(false);
  });

  it("different projectDir not polluted by other project writes", () => {
    const otherProject = mktemp();
    try {
      appendJournal(baseEntry({ agent: "cursor" }), projectDir);
      expect(readJournal("cursor", otherProject)).toHaveLength(0);
    } finally {
      fs.rmSync(otherProject, { recursive: true, force: true });
    }
  });

  it("multiple project agents in one file — filtered correctly", () => {
    appendJournal(baseEntry({ agent: "cursor" }), projectDir);
    appendJournal(baseEntry({ agent: "opencode", target_path: "/t/oc" }), projectDir);
    expect(readJournal("cursor", projectDir)).toHaveLength(1);
    expect(readJournal("opencode", projectDir)).toHaveLength(1);
    expect(readJournal("windsurf", projectDir)).toHaveLength(0);
  });
});

// ── clearJournal() ────────────────────────────────────────────────────────────

describe("clearJournal — global agents", () => {
  let stateDir: string;
  const origFulcrum = process.env["FULCRUM_STATE_DIR"];

  beforeEach(() => {
    stateDir = mktemp();
    process.env["FULCRUM_STATE_DIR"] = stateDir;
  });

  afterEach(() => {
    fs.rmSync(stateDir, { recursive: true, force: true });
    if (origFulcrum === undefined) delete process.env["FULCRUM_STATE_DIR"];
    else process.env["FULCRUM_STATE_DIR"] = origFulcrum;
  });

  it("removes all entries for an agent", () => {
    appendJournal(baseEntry({ agent: "claude" }));
    appendJournal(baseEntry({ agent: "claude", step_name: "step-2" }));
    clearJournal("claude");
    expect(readJournal("claude")).toHaveLength(0);
  });

  it("preserves entries for other global agents", () => {
    appendJournal(baseEntry({ agent: "gemini" }));
    appendJournal(baseEntry({ agent: "claude" }));
    clearJournal("gemini");
    expect(readJournal("gemini")).toHaveLength(0);
    expect(readJournal("claude")).toHaveLength(1);
  });

  it("is a no-op when journal file does not exist", () => {
    expect(() => clearJournal("pi")).not.toThrow();
  });
});

describe("clearJournal — project agents", () => {
  let projectDir: string;
  let stateDir: string;
  const origFulcrum = process.env["FULCRUM_STATE_DIR"];

  beforeEach(() => {
    projectDir = mktemp();
    stateDir = mktemp();
    process.env["FULCRUM_STATE_DIR"] = stateDir;
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
    if (origFulcrum === undefined) delete process.env["FULCRUM_STATE_DIR"];
    else process.env["FULCRUM_STATE_DIR"] = origFulcrum;
  });

  it("removes cursor entries; preserves opencode entries in shared file", () => {
    appendJournal(baseEntry({ agent: "cursor" }), projectDir);
    appendJournal(baseEntry({ agent: "opencode" }), projectDir);
    clearJournal("cursor", projectDir);
    expect(readJournal("cursor", projectDir)).toHaveLength(0);
    expect(readJournal("opencode", projectDir)).toHaveLength(1);
  });
});

// ── install_run_id grouping ───────────────────────────────────────────────────

describe("install_run_id grouping", () => {
  let stateDir: string;
  const origFulcrum = process.env["FULCRUM_STATE_DIR"];

  beforeEach(() => {
    stateDir = mktemp();
    process.env["FULCRUM_STATE_DIR"] = stateDir;
  });

  afterEach(() => {
    fs.rmSync(stateDir, { recursive: true, force: true });
    if (origFulcrum === undefined) delete process.env["FULCRUM_STATE_DIR"];
    else process.env["FULCRUM_STATE_DIR"] = origFulcrum;
  });

  it("readJournal with runId returns only entries for that run", () => {
    appendJournal(baseEntry({ agent: "claude", install_run_id: "run-A", step_name: "a1" }));
    appendJournal(baseEntry({ agent: "claude", install_run_id: "run-B", step_name: "b1" }));
    appendJournal(baseEntry({ agent: "claude", install_run_id: "run-A", step_name: "a2" }));
    const rows = readJournal("claude", undefined, { runId: "run-A" });
    expect(rows.map(r => r.step_name)).toEqual(["a1", "a2"]);
  });
});
