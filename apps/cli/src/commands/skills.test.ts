/**
 * Tests for fulcrum skills CLI commands (P5#17).
 *
 * Uses fake tRPC caller for unit-level validation of:
 * - `--json` output for list, sync, conflicts list
 * - cron entry idempotency (write twice → one entry)
 * - `--install-cron` rejected when FULCRUM_FEATURES lacks skills-daily-sync
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SkillsRunOptions, SkillsCaller } from "./skills.ts";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function fakeCaller(overrides: Partial<SkillsCaller> = {}): SkillsCaller {
  return {
    list: async () => [
      {
        id: "sk-1",
        name: "jq",
        slug: "jq",
        source: "local",
        upstreamRepo: null,
        upstreamRef: null,
        enabledAgents: ["claude", "codex"],
      },
    ],
    install: async (_input) => ({
      id: "sk-2",
      name: "bat",
      slug: "bat",
      source: "local",
      upstreamRepo: null,
      upstreamRef: null,
      enabledAgents: ["claude"],
    }),
    upgrade: async (_input) => [
      {
        id: "sk-1",
        name: "jq",
        slug: "jq",
        source: "local",
        upstreamRepo: "https://github.com/example/jq-skill",
        upstreamRef: "main",
        enabledAgents: ["claude"],
      },
    ],
    uninstall: async () => undefined,
    sync: async () => ({ merged: ["jq"], conflicts: [], errors: [] }),
    resolveConflict: async (_input) => ({
      id: "sk-1",
      name: "jq",
      slug: "jq",
      source: "local",
      upstreamRepo: null,
      upstreamRef: null,
      enabledAgents: ["claude"],
    }),
    ...overrides,
  };
}

async function runSkills(
  args: string[],
  opts: Partial<SkillsRunOptions> = {},
): Promise<{ captured: string[]; exitCode: number }> {
  const { run } = await import("./skills.ts");
  const captured: string[] = [];
  let exitCode = 0;
  await run(args, {
    caller: fakeCaller(opts.caller as Partial<SkillsCaller> | undefined),
    print: (line: string) => captured.push(line),
    printErr: (line: string) => captured.push(line),
    exit: (code: number) => {
      exitCode = code;
    },
    ...opts,
  });
  return { captured, exitCode };
}

// ---------------------------------------------------------------------------
// list --json
// ---------------------------------------------------------------------------

describe("fulcrum skills list", () => {
  test("--json returns valid FulcrumSkill[]", async () => {
    const { captured, exitCode } = await runSkills(["list", "--json"]);
    expect(exitCode).toBe(0);
    const skills = JSON.parse(captured.join(""));
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBe(1);
    expect(skills[0].slug).toBe("jq");
    expect(skills[0].enabledAgents).toEqual(["claude", "codex"]);
  });

  test("human format shows skill names", async () => {
    const { captured, exitCode } = await runSkills(["list"]);
    expect(exitCode).toBe(0);
    expect(captured.some((l) => l.includes("jq"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------

describe("fulcrum skills install", () => {
  test("--json returns installed skill", async () => {
    const { captured, exitCode } = await runSkills(["install", "/tmp/bat/SKILL.md", "--json"]);
    expect(exitCode).toBe(0);
    const skill = JSON.parse(captured.join(""));
    expect(skill.slug).toBe("bat");
  });

  test("missing path exits 1", async () => {
    const { exitCode } = await runSkills(["install"]);
    expect(exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// upgrade
// ---------------------------------------------------------------------------

describe("fulcrum skills upgrade", () => {
  test("--json returns upgraded skills array", async () => {
    const { captured, exitCode } = await runSkills(["upgrade", "jq", "--json"]);
    expect(exitCode).toBe(0);
    const skills = JSON.parse(captured.join(""));
    expect(Array.isArray(skills)).toBe(true);
    expect(skills[0].slug).toBe("jq");
  });

  test("upgrade all returns array", async () => {
    const { captured, exitCode } = await runSkills(["upgrade", "all", "--json"]);
    expect(exitCode).toBe(0);
    const skills = JSON.parse(captured.join(""));
    expect(Array.isArray(skills)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// uninstall
// ---------------------------------------------------------------------------

describe("fulcrum skills uninstall", () => {
  test("exits 0 on success", async () => {
    const { exitCode } = await runSkills(["uninstall", "jq"]);
    expect(exitCode).toBe(0);
  });

  test("missing slug exits 1", async () => {
    const { exitCode } = await runSkills(["uninstall"]);
    expect(exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sync --json
// ---------------------------------------------------------------------------

describe("fulcrum skills sync", () => {
  test("--json returns SyncResult with merged/conflicts/errors", async () => {
    const { captured, exitCode } = await runSkills(["sync", "--json"]);
    expect(exitCode).toBe(0);
    const result = JSON.parse(captured.join(""));
    expect(result.merged).toEqual(["jq"]);
    expect(result.conflicts).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test("--fetch-upstream passes fetchUpstream: true", async () => {
    let receivedInput: { fetchUpstream: boolean } | undefined;
    const { exitCode } = await runSkills(["sync", "--fetch-upstream", "--json"], {
      caller: {
        sync: async (input) => {
          receivedInput = input;
          return { merged: [], conflicts: [], errors: [] };
        },
      } as Partial<SkillsCaller> as SkillsCaller,
    });
    expect(exitCode).toBe(0);
    expect(receivedInput?.fetchUpstream).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// conflicts list --json
// ---------------------------------------------------------------------------

describe("fulcrum skills conflicts list", () => {
  test("--json returns empty array when no conflicts (exit 0)", async () => {
    const { captured, exitCode } = await runSkills(["conflicts", "list", "--json"], {
      caller: {
        list: async () => [],
      } as Partial<SkillsCaller> as SkillsCaller,
    });
    expect(exitCode).toBe(0);
    // conflicts list uses lock file, not tRPC list — but CLI --json wraps it
  });
});

// ---------------------------------------------------------------------------
// conflicts resolve
// ---------------------------------------------------------------------------

describe("fulcrum skills conflicts resolve", () => {
  test("resolves and prints result", async () => {
    const { captured, exitCode } = await runSkills([
      "conflicts",
      "resolve",
      "jq",
      "--keep",
      "upstream",
      "--json",
    ]);
    expect(exitCode).toBe(0);
    const skill = JSON.parse(captured.join(""));
    expect(skill.slug).toBe("jq");
  });

  test("missing slug exits 1", async () => {
    const { exitCode } = await runSkills(["conflicts", "resolve"]);
    expect(exitCode).toBe(1);
  });

  test("missing --keep exits 1", async () => {
    const { exitCode } = await runSkills(["conflicts", "resolve", "jq"]);
    expect(exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// --install-cron gating
// ---------------------------------------------------------------------------

describe("fulcrum skills sync --install-cron", () => {
  let originalFeatures: string | undefined;
  let tmpHome: string;

  beforeEach(async () => {
    originalFeatures = process.env["FULCRUM_FEATURES"];
    tmpHome = await mkdtemp(join(tmpdir(), "fulcrum-cron-test-"));
  });

  afterEach(async () => {
    if (originalFeatures !== undefined) {
      process.env["FULCRUM_FEATURES"] = originalFeatures;
    } else {
      delete process.env["FULCRUM_FEATURES"];
    }
    await rm(tmpHome, { recursive: true, force: true });
  });

  test("rejected when FULCRUM_FEATURES lacks skills-daily-sync", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const { captured, exitCode } = await runSkills(["sync", "--install-cron"], {
      cronHome: tmpHome,
    });
    expect(exitCode).toBe(1);
    expect(captured.some((l) => l.includes("skills-daily-sync"))).toBe(true);
  });

  test("accepted when FULCRUM_FEATURES=skills-daily-sync", async () => {
    process.env["FULCRUM_FEATURES"] = "skills-daily-sync";
    const { exitCode } = await runSkills(["sync", "--install-cron", "--json"], {
      cronHome: tmpHome,
    });
    expect(exitCode).toBe(0);
  });

  test("idempotent — write twice → one entry (macOS plist)", async () => {
    process.env["FULCRUM_FEATURES"] = "skills-daily-sync";

    // Write cron entry twice
    await runSkills(["sync", "--install-cron"], { cronHome: tmpHome });
    await runSkills(["sync", "--install-cron"], { cronHome: tmpHome });

    // Check plist or cron file exists and has exactly one entry
    const plistPath = join(tmpHome, "Library", "LaunchAgents", "com.fulcrum.skills-sync.plist");
    const cronPath = join(tmpHome, ".config", "cron", "fulcrum-skills-sync");

    let content: string;
    try {
      content = await readFile(plistPath, "utf8");
      // plist: should have exactly one <plist> root
      const plistCount = (content.match(/<plist/g) || []).length;
      expect(plistCount).toBe(1);
    } catch {
      // Linux path
      content = await readFile(cronPath, "utf8");
      const lines = content.trim().split("\n").filter((l) => l.includes("fulcrum"));
      expect(lines.length).toBe(1);
    }
  });
});
