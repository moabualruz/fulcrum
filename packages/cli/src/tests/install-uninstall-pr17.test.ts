/**
 * PR 17 — `fulcrum install uninstall` TDD test suite.
 *
 * Tests journal-driven symmetric uninstall:
 *   - Reads journal in reverse order and applies reversal per action type
 *   - Drift detection: sha256 mismatch → orphan rename (default) or delete (--purge)
 *   - Fallback: no journal → wipe is called
 *   - Idempotency: second run is a no-op
 *   - dry-run: zero FS mutations, journal not cleared
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { appendJournal } from "../../../../packages/agent-fanout/src/install-journal.js";
import { uninstallAgent, type UninstallOpts } from "../../../../agent-integration/uninstall.js";

// ── helpers ────────────────────────────────────────────────────────────────────

function mktemp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uninstall-test-"));
}

function mkfile(filePath: string, content = "content"): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

let tmpDir: string;
let fakeHome: string;

beforeEach(() => {
  tmpDir = mktemp();
  fakeHome = mktemp();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(fakeHome, { recursive: true, force: true });
});

function uninstallProject(opts: Omit<UninstallOpts, "agent" | "targetDir" | "scope"> = {}) {
  return uninstallAgent({ agent: "cursor", targetDir: tmpDir, home: fakeHome, scope: "project", ...opts });
}

// ── fallback when no journal ─────────────────────────────────────────────────

describe("no-journal fallback", () => {
  it("returns fallback:true when no journal exists", () => {
    const result = uninstallAgent({ agent: "cursor", dryRun: false, purge: false, targetDir: tmpDir, home: fakeHome });
    expect(result.fallback).toBe(true);
    expect(result.uninstalled).toBe(0);
  });

  it("dry-run: fallback still returns fallback:true without FS changes", () => {
    const result = uninstallAgent({ agent: "cursor", dryRun: true, purge: false, targetDir: tmpDir, home: fakeHome });
    expect(result.fallback).toBe(true);
  });

  it("does not project-wipe on no-journal fallback without scope=project", () => {
    const hookPath = path.join(tmpDir, ".github/hooks/fulcrum.json");
    mkfile(hookPath, "{}");

    const result = uninstallAgent({ agent: "copilot", dryRun: false, purge: false, targetDir: tmpDir, home: fakeHome });

    expect(result.fallback).toBe(true);
    expect(fs.existsSync(hookPath)).toBe(true);
  });
});

// ── write_file action ────────────────────────────────────────────────────────

describe("write_file reversal", () => {
  it("deletes file when sha256 matches journal", () => {
    const filePath = path.join(tmpDir, "rules", "fulcrum-first.md");
    const content = "# Fulcrum First\n";
    mkfile(filePath, content);
    const hash = sha256(content);
    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "write rules file",
        action: "write_file",
        target_path: filePath,
        rollback: `rm -f ${filePath}`,
        mode: "manual",
        install_run_id: "run-test-1",
        sha256_after: hash,
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: false, purge: false });
    expect(result.uninstalled).toBe(1);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(result.actions[0]!.result).toBe("ok");
  });

  it("renames to .fulcrum-orphan on sha256 mismatch (default)", () => {
    const filePath = path.join(tmpDir, "rules", "fulcrum-first.md");
    mkfile(filePath, "# Original installed content\n");
    const staleHash = sha256("# stale content from install\n");
    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "write rules file",
        action: "write_file",
        target_path: filePath,
        rollback: `rm -f ${filePath}`,
        mode: "manual",
        install_run_id: "run-test-2",
        sha256_after: staleHash, // mismatch — file was hand-edited
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: false, purge: false });
    expect(result.orphaned).toBe(1);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(filePath + ".fulcrum-orphan")).toBe(true);
    expect(result.actions[0]!.result).toBe("orphaned");
  });

  it("purge: deletes file even on sha256 mismatch", () => {
    const filePath = path.join(tmpDir, "rules", "fulcrum-first.md");
    mkfile(filePath, "# Hand-edited content\n");
    const staleHash = sha256("# original\n");
    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "write rules file",
        action: "write_file",
        target_path: filePath,
        rollback: `rm -f ${filePath}`,
        mode: "manual",
        install_run_id: "run-test-3",
        sha256_after: staleHash,
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: false, purge: true });
    expect(result.uninstalled).toBe(1);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(filePath + ".fulcrum-orphan")).toBe(false);
    expect(result.actions[0]!.result).toBe("ok");
  });

  it("skips silently when file already gone (idempotent)", () => {
    // File doesn't exist — journal entry is there but target is already gone
    const filePath = path.join(tmpDir, "rules", "gone.md");
    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "write rules file",
        action: "write_file",
        target_path: filePath,
        rollback: `rm -f ${filePath}`,
        mode: "manual",
        install_run_id: "run-test-4",
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: false, purge: false });
    expect(result.skipped).toBe(1);
    expect(result.uninstalled).toBe(0);
    expect(result.actions[0]!.result).toBe("skipped");
  });

  it("deletes directory tree when target_path is a directory", () => {
    const dirPath = path.join(tmpDir, "extensions", "fulcrum");
    fs.mkdirSync(path.join(dirPath, "sub"), { recursive: true });
    fs.writeFileSync(path.join(dirPath, "sub", "file.md"), "x");
    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "write extension dir",
        action: "write_file",
        target_path: dirPath,
        rollback: `rm -rf ${dirPath}`,
        mode: "manual",
        install_run_id: "run-test-5",
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: false, purge: false });
    expect(result.uninstalled).toBe(1);
    expect(fs.existsSync(dirPath)).toBe(false);
  });

  it("no sha256_after recorded → deletes without drift check", () => {
    const filePath = path.join(tmpDir, "config.md");
    mkfile(filePath, "# any content\n");
    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "write config",
        action: "write_file",
        target_path: filePath,
        rollback: `rm -f ${filePath}`,
        mode: "manual",
        install_run_id: "run-test-6",
        // sha256_after deliberately absent
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: false, purge: false });
    expect(result.uninstalled).toBe(1);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

// ── symlink action ───────────────────────────────────────────────────────────

describe("symlink reversal", () => {
  it("removes symlink", () => {
    const target = path.join(tmpDir, "skills-source");
    const linkPath = path.join(tmpDir, "skills-link");
    fs.mkdirSync(target, { recursive: true });
    fs.symlinkSync(target, linkPath);
    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "create skills symlink",
        action: "symlink",
        target_path: linkPath,
        rollback: `rm -f ${linkPath}`,
        mode: "manual",
        install_run_id: "run-test-7",
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: false, purge: false });
    expect(result.uninstalled).toBe(1);
    let exists = false;
    try { fs.lstatSync(linkPath); exists = true; } catch { /* */ }
    expect(exists).toBe(false);
  });

  it("skips non-symlink path", () => {
    const filePath = path.join(tmpDir, "not-a-symlink.md");
    mkfile(filePath, "regular file");
    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "create symlink",
        action: "symlink",
        target_path: filePath,
        rollback: `rm -f ${filePath}`,
        mode: "manual",
        install_run_id: "run-test-8",
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: false, purge: false });
    expect(result.skipped).toBe(1);
    expect(fs.existsSync(filePath)).toBe(true); // not deleted
  });
});

// ── managed_marker action ────────────────────────────────────────────────────

describe("managed_marker reversal", () => {
  it("executes rollback command to strip marker block from shared config", () => {
    const configPath = path.join(tmpDir, "config.toml");
    const withMarker = `
[settings]
key = "value"

# BEGIN FULCRUM MANAGED BLOCK — mcp
[mcp_servers.fulcrum]
command = "fulcrum"
# END FULCRUM MANAGED BLOCK — mcp

[other]
x = 1
`;
    mkfile(configPath, withMarker);

    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "merge mcp block",
        action: "managed_marker",
        target_path: configPath,
        rollback: `sed -i '/# BEGIN FULCRUM MANAGED BLOCK — mcp/,/# END FULCRUM MANAGED BLOCK — mcp/d' ${configPath}`,
        mode: "manual",
        install_run_id: "run-test-9",
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: false, purge: false });
    expect(result.uninstalled).toBe(1);
    const after = fs.readFileSync(configPath, "utf8");
    expect(after).not.toContain("BEGIN FULCRUM MANAGED BLOCK");
    expect(after).toContain('[settings]');
    expect(after).toContain('[other]');
  });
});

// ── native_cli action ────────────────────────────────────────────────────────

describe("native_cli reversal", () => {
  it("executes rollback command and reports ok", () => {
    const sentinelPath = path.join(tmpDir, "sentinel.txt");
    mkfile(sentinelPath, "installed");

    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "native install",
        action: "native_cli",
        target_path: path.join(tmpDir, "native-placeholder"),
        rollback: `rm -f ${sentinelPath}`,
        mode: "native",
        install_run_id: "run-test-10",
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: false, purge: false });
    expect(result.uninstalled).toBe(1);
    expect(result.actions[0]!.result).toBe("ok");
  });

  it("reports error (but continues) when rollback command fails; errors counted separately from skipped", () => {
    const filePath1 = path.join(tmpDir, "file1.md");
    mkfile(filePath1, "content");
    const hash1 = sha256("content");

    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "step 1 — write file",
        action: "write_file",
        target_path: filePath1,
        rollback: `rm -f ${filePath1}`,
        mode: "manual",
        install_run_id: "run-test-err",
        sha256_after: hash1,
      },
      tmpDir,
    );
    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "step 2 — failing cli",
        action: "native_cli",
        target_path: path.join(tmpDir, "placeholder"),
        rollback: "this-command-does-not-exist-xyz-fulcrum-test",
        mode: "native",
        install_run_id: "run-test-err",
      },
      tmpDir,
    );

    // Should not throw; step 1 should still succeed even though step 2 errors
    const result = uninstallProject({ dryRun: false, purge: false });
    expect(result.actions.length).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.skipped).toBe(0); // errors must NOT be counted as skipped
    // The write_file was at index 0 in journal but reversed = last processed first
    const step1 = result.actions.find((a) => a.step_name === "step 1 — write file")!;
    expect(step1.result).toBe("ok");
  });

  it("preserves journal when errors occur (for retry)", () => {
    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "failing cli",
        action: "native_cli",
        target_path: path.join(tmpDir, "placeholder"),
        rollback: "this-command-does-not-exist-xyz-fulcrum-test",
        mode: "native",
        install_run_id: "run-test-preserve",
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: false, purge: false });
    expect(result.errors).toBe(1);
    // Journal should NOT be cleared so a retry is possible
    const journalFile = path.join(tmpDir, ".fulcrum", "install.jsonl");
    expect(fs.existsSync(journalFile)).toBe(true);
  });
});

// ── merge_json action ────────────────────────────────────────────────────────

describe("merge_json reversal", () => {
  it("executes rollback shell command to remove key from JSON", () => {
    const jsonPath = path.join(tmpDir, "settings.json");
    const withKey = JSON.stringify({ hooks: { fulcrum: true }, other: 42 }, null, 2) + "\n";
    mkfile(jsonPath, withKey);

    const rollback = `node -e "const f='${jsonPath}',d=JSON.parse(require('fs').readFileSync(f,'utf8'));delete d.hooks;require('fs').writeFileSync(f,JSON.stringify(d,null,2)+'\\n')"`;
    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "merge json",
        action: "merge_json",
        target_path: jsonPath,
        rollback,
        mode: "manual",
        install_run_id: "run-test-json",
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: false, purge: false });
    expect(result.uninstalled).toBe(1);
    const after = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(after.hooks).toBeUndefined();
    expect(after.other).toBe(42);
  });
});

// ── boundary check ───────────────────────────────────────────────────────────

describe("path boundary check", () => {
  it("default user scope skips project files even when project lives under home", () => {
    const projectDir = path.join(fakeHome, "workspace", "repo");
    const projectFile = path.join(projectDir, "AGENTS.md");
    mkfile(projectFile, "project instructions");
    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "project file",
        action: "write_file",
        target_path: projectFile,
        rollback: `rm -f ${projectFile}`,
        mode: "manual",
        install_run_id: "run-user-scope-boundary",
      },
      projectDir,
    );

    const result = uninstallAgent({ agent: "cursor", dryRun: false, purge: false, targetDir: projectDir, home: fakeHome });

    expect(result.skipped).toBe(1);
    expect(fs.existsSync(projectFile)).toBe(true);
  });

  it("skips entry whose target_path escapes allowed roots", () => {
    const outsidePath = path.join(os.tmpdir(), "outside-root-" + Date.now() + ".txt");
    mkfile(outsidePath, "sensitive");
    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "outside root",
        action: "write_file",
        target_path: outsidePath,
        rollback: `rm -f ${outsidePath}`,
        mode: "manual",
        install_run_id: "run-boundary",
      },
      tmpDir,
    );

    const result = uninstallAgent({ agent: "cursor", dryRun: false, purge: false, targetDir: tmpDir, home: fakeHome, scope: "project" });
    expect(result.skipped).toBe(1);
    expect(fs.existsSync(outsidePath)).toBe(true); // file untouched
    fs.rmSync(outsidePath, { force: true }); // cleanup
  });
});

// ── orphan collision ──────────────────────────────────────────────────────────

describe("orphan rename collision", () => {
  it("uses timestamp suffix when .fulcrum-orphan already exists", () => {
    const filePath = path.join(tmpDir, "drifted.md");
    const orphanPath = filePath + ".fulcrum-orphan";
    mkfile(filePath, "# Current content (hand-edited)\n");
    mkfile(orphanPath, "# Previous orphan\n"); // pre-existing orphan

    appendJournal(
      {
        ts: new Date().toISOString(),
        agent: "cursor",
        step_name: "write file",
        action: "write_file",
        target_path: filePath,
        rollback: `rm -f ${filePath}`,
        mode: "manual",
        install_run_id: "run-collision",
        sha256_after: sha256("# original install content\n"), // mismatch
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: false, purge: false });
    expect(result.orphaned).toBe(1);
    expect(fs.existsSync(filePath)).toBe(false);
    // original orphan should still exist
    expect(fs.existsSync(orphanPath)).toBe(true);
    // a new orphan with timestamp suffix should exist
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const newOrphans = fs.readdirSync(dir).filter((f) => f.startsWith(base + ".fulcrum-orphan."));
    expect(newOrphans.length).toBe(1);
  });
});

// ── reverse-order walking ────────────────────────────────────────────────────

describe("reverse order walking", () => {
  it("processes entries in reverse of journal order", () => {
    const file1 = path.join(tmpDir, "file1.txt");
    const file2 = path.join(tmpDir, "file2.txt");
    mkfile(file1, "a");
    mkfile(file2, "b");
    const hash1 = sha256("a");
    const hash2 = sha256("b");
    const order: string[] = [];

    appendJournal(
      {
        ts: new Date().toISOString(), agent: "cursor", step_name: "step-A",
        action: "write_file", target_path: file1, rollback: "", mode: "manual",
        install_run_id: "run-order", sha256_after: hash1,
      },
      tmpDir,
    );
    appendJournal(
      {
        ts: new Date().toISOString(), agent: "cursor", step_name: "step-B",
        action: "write_file", target_path: file2, rollback: "", mode: "manual",
        install_run_id: "run-order", sha256_after: hash2,
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: false, purge: false });
    // Reversed: step-B processed first, then step-A
    expect(result.actions[0]!.step_name).toBe("step-B");
    expect(result.actions[1]!.step_name).toBe("step-A");
  });
});

// ── dry-run ──────────────────────────────────────────────────────────────────

describe("dry-run mode", () => {
  it("makes no FS changes and reports what would be done", () => {
    const filePath = path.join(tmpDir, "rules", "fulcrum.md");
    const content = "# Rules\n";
    mkfile(filePath, content);
    const hash = sha256(content);
    appendJournal(
      {
        ts: new Date().toISOString(), agent: "cursor", step_name: "write rules",
        action: "write_file", target_path: filePath, rollback: `rm -f ${filePath}`,
        mode: "manual", install_run_id: "run-dry", sha256_after: hash,
      },
      tmpDir,
    );

    const result = uninstallProject({ dryRun: true, purge: false });
    expect(result.dryRun).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true); // file untouched
    // Journal still exists (dry-run doesn't clear it)
    const journalFile = path.join(tmpDir, ".fulcrum", "install.jsonl");
    expect(fs.existsSync(journalFile)).toBe(true);
  });
});

// ── idempotency (journal cleared after success) ──────────────────────────────

describe("idempotency", () => {
  it("second run falls back to wipe (no-op) after journal is cleared", () => {
    const filePath = path.join(tmpDir, "rules", "fulcrum.md");
    mkfile(filePath, "# Rules\n");
    const hash = sha256("# Rules\n");
    appendJournal(
      {
        ts: new Date().toISOString(), agent: "cursor", step_name: "write rules",
        action: "write_file", target_path: filePath, rollback: `rm -f ${filePath}`,
        mode: "manual", install_run_id: "run-idem", sha256_after: hash,
      },
      tmpDir,
    );

    const first = uninstallProject({ dryRun: false, purge: false });
    expect(first.uninstalled).toBe(1);
    expect(first.fallback).toBe(false);

    const second = uninstallProject({ dryRun: false, purge: false });
    expect(second.fallback).toBe(true); // journal cleared; falls back to wipe (no-op)
    expect(second.uninstalled).toBe(0);
  });
});
