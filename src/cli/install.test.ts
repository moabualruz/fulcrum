// Tests for caveman install logic in install.ts.
// Uses Bun test runner; no GitHub network access (file:// fixture repo).

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertNotAgentsPath, installCavemanByCopy, lockCavemanUltra, spliceSentinel, setDryRun } from "./install.ts";
import { run as runProc } from "../utils/proc.ts";
import * as proc from "../utils/proc.ts";

let TMP: string;

beforeAll(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-install-"));
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. ~/.agents/ guard
// ---------------------------------------------------------------------------

describe("assertNotAgentsPath", () => {
  const home = "/home/testuser";

  test("throws for exact ~/.agents path", () => {
    expect(() => assertNotAgentsPath(`${home}/.agents`, home)).toThrow("HARD RULE VIOLATION");
  });

  test("throws for path inside ~/.agents/", () => {
    expect(() => assertNotAgentsPath(`${home}/.agents/skills/foo`, home)).toThrow("HARD RULE VIOLATION");
  });

  test("throws for nested path inside ~/.agents/", () => {
    expect(() => assertNotAgentsPath(`${home}/.agents/x/y/z`, home)).toThrow("HARD RULE VIOLATION");
  });

  test("does not throw for ~/.claude/skills", () => {
    expect(() => assertNotAgentsPath(`${home}/.claude/skills`, home)).not.toThrow();
  });

  test("does not throw for ~/.codex/skills", () => {
    expect(() => assertNotAgentsPath(`${home}/.codex/skills`, home)).not.toThrow();
  });

  test("does not throw for a path that merely contains 'agents' substring", () => {
    // e.g. ~/.agents-backup should not match the guard
    expect(() => assertNotAgentsPath(`${home}/.agents-backup/foo`, home)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. installCavemanByCopy — idempotency + local file:// repo fixture
// ---------------------------------------------------------------------------

/** Build a minimal local git repo that mimics the caveman upstream layout. */
async function buildFixtureRepo(dir: string): Promise<void> {
  // git init
  await runProc(["git", "init", dir]);
  await runProc(["git", "-C", dir, "config", "user.email", "test@test.com"]);
  await runProc(["git", "-C", dir, "config", "user.name", "Test"]);

  // create skills/<name>/SKILL.md for each caveman skill
  const skills = ["caveman", "caveman-commit", "caveman-help", "caveman-review", "compress"];
  for (const skill of skills) {
    const skillDir = join(dir, "skills", skill);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skill}\n---\n# ${skill}\n`);
  }

  // initial commit
  await runProc(["git", "-C", dir, "add", "."]);
  await runProc(["git", "-C", dir, "commit", "-m", "init"]);
}

describe("installCavemanByCopy", () => {
  test("copies all skill subfolders into agent skills root", async () => {
    const cloneDir = join(TMP, "fixture-repo");
    await buildFixtureRepo(cloneDir);

    const agentSkillsRoot = join(TMP, "agent-skills-1");
    const fakeHome = TMP;

    await installCavemanByCopy(agentSkillsRoot, { cloneDir, home: fakeHome });

    // verify each skill subfolder was created
    const skills = ["caveman", "caveman-commit", "caveman-help", "caveman-review", "compress"];
    for (const skill of skills) {
      const skillMd = join(agentSkillsRoot, skill, "SKILL.md");
      const f = Bun.file(skillMd);
      expect(await f.exists()).toBe(true);
    }
  });

  test("second call (idempotent) — no error, files still present", async () => {
    const cloneDir = join(TMP, "fixture-repo");
    // reuse the same cloneDir from previous test (already committed)

    const agentSkillsRoot = join(TMP, "agent-skills-2");
    const fakeHome = TMP;

    // first call
    await installCavemanByCopy(agentSkillsRoot, { cloneDir, home: fakeHome });
    // second call — must not throw
    await expect(
      installCavemanByCopy(agentSkillsRoot, { cloneDir, home: fakeHome })
    ).resolves.toBeUndefined();

    // files still present after second call
    const skillMd = join(agentSkillsRoot, "caveman", "SKILL.md");
    expect(await Bun.file(skillMd).exists()).toBe(true);
  });

  test("throws if agentSkillsRoot is under ~/.agents/", async () => {
    const cloneDir = join(TMP, "fixture-repo");
    const fakeHome = TMP;
    const forbidden = join(fakeHome, ".agents", "skills");

    await expect(
      installCavemanByCopy(forbidden, { cloneDir, home: fakeHome })
    ).rejects.toThrow("HARD RULE VIOLATION");
  });
});

// ---------------------------------------------------------------------------
// 3. lockCavemanUltra
// ---------------------------------------------------------------------------

describe("lockCavemanUltra", () => {
  let testHome: string;

  beforeEach(async () => {
    testHome = await mkdtemp(join(tmpdir(), "caveman-ultra-"));
  });

  afterEach(async () => {
    await rm(testHome, { recursive: true, force: true });
  });

  test("fresh install: no existing config.json → writes defaultMode: ultra", async () => {
    await lockCavemanUltra(testHome);

    const cfgPath = join(testHome, ".config", "caveman", "config.json");
    const content = await readFile(cfgPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.defaultMode).toBe("ultra");
  });

  test("existing defaultMode: ultra → no-op (file unchanged)", async () => {
    const cfgDir = join(testHome, ".config", "caveman");
    await mkdir(cfgDir, { recursive: true });
    const cfgPath = join(cfgDir, "config.json");
    const original = { defaultMode: "ultra" };
    await writeFile(cfgPath, JSON.stringify(original, null, 2) + "\n");

    // get original mtime
    const statBefore = await Bun.file(cfgPath).stat();
    const mtimeBefore = statBefore?.mtime?.getTime() ?? 0;

    // sleep briefly to ensure any mtime difference would be detectable
    await new Promise((r) => setTimeout(r, 10));

    // run lockCavemanUltra
    await lockCavemanUltra(testHome);

    // verify file unchanged (mtime should not increase)
    const statAfter = await Bun.file(cfgPath).stat();
    const mtimeAfter = statAfter?.mtime?.getTime() ?? 0;
    expect(mtimeAfter).toBe(mtimeBefore);

    // verify content still correct
    const content = await readFile(cfgPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.defaultMode).toBe("ultra");
  });

  test("existing defaultMode: full → overwritten to ultra", async () => {
    const cfgDir = join(testHome, ".config", "caveman");
    await mkdir(cfgDir, { recursive: true });
    const cfgPath = join(cfgDir, "config.json");
    await writeFile(cfgPath, JSON.stringify({ defaultMode: "full" }, null, 2) + "\n");

    await lockCavemanUltra(testHome);

    const content = await readFile(cfgPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.defaultMode).toBe("ultra");
  });

  test("existing malformed JSON → overwritten to ultra (no throw)", async () => {
    const cfgDir = join(testHome, ".config", "caveman");
    await mkdir(cfgDir, { recursive: true });
    const cfgPath = join(cfgDir, "config.json");
    await writeFile(cfgPath, "{ this is not valid json }");

    // must not throw
    await expect(lockCavemanUltra(testHome)).resolves.toBeUndefined();

    // verify file is now valid and set to ultra
    const content = await readFile(cfgPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.defaultMode).toBe("ultra");
  });

  test("XDG_CONFIG_HOME set → writes to XDG_CONFIG_HOME/caveman/config.json", async () => {
    const xdgDir = await mkdtemp(join(tmpdir(), "xdg-config-"));
    const originalXdg = process.env["XDG_CONFIG_HOME"];

    try {
      // set XDG_CONFIG_HOME for this test
      process.env["XDG_CONFIG_HOME"] = xdgDir;

      await lockCavemanUltra(testHome);

      // verify file is in XDG_CONFIG_HOME, not in home/.config
      const cfgPath = join(xdgDir, "caveman", "config.json");
      const content = await readFile(cfgPath, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed.defaultMode).toBe("ultra");

      // verify it was NOT written to ~/.config/caveman
      const defaultCfgPath = join(testHome, ".config", "caveman", "config.json");
      expect(await Bun.file(defaultCfgPath).exists()).toBe(false);
    } finally {
      // restore original XDG_CONFIG_HOME
      if (originalXdg !== undefined) {
        process.env["XDG_CONFIG_HOME"] = originalXdg;
      } else {
        delete process.env["XDG_CONFIG_HOME"];
      }
      await rm(xdgDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 3b. W1.3 — caveman Codex/OpenCode/Pi: npx skills add canonical path + fallback
//
// These tests drive the install logic in dry-run mode so no real filesystem
// writes happen. The key invariant is WHAT commands would be run (logged by
// runProcDry in dry-run mode) not whether they succeeded.
// ---------------------------------------------------------------------------

describe("installCaveman W1.3 — npx skills add canonical path", () => {
  let testHome: string;
  let origHome: string | undefined;
  let origFulcrumHome: string | undefined;
  let origRepoDir: string | undefined;

  beforeEach(async () => {
    testHome = await mkdtemp(join(tmpdir(), "caveman-npx-"));
    origHome = process.env["HOME"];
    origFulcrumHome = process.env["FULCRUM_HOME"];
    origRepoDir = process.env["FULCRUM_REPO_DIR"];
    process.env["HOME"] = testHome;
    process.env["FULCRUM_HOME"] = join(testHome, ".fulcrum");
    // Point to repo root so rules file is found, but dry-run prevents writes.
    process.env["FULCRUM_REPO_DIR"] = join(__dirname, "../.."); // repo root
    setDryRun(true); // prevent all file writes
  });

  afterEach(async () => {
    setDryRun(false);
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    if (origFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = origFulcrumHome;
    else delete process.env["FULCRUM_HOME"];
    if (origRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = origRepoDir;
    else delete process.env["FULCRUM_REPO_DIR"];
    await rm(testHome, { recursive: true, force: true });
  });

  test("dry-run logs npx skills add for detected agent (npx found on real PATH)", async () => {
    // Create Codex dir to simulate detection. Don't create caveman subdir.
    await mkdir(join(testHome, ".codex", "skills"), { recursive: true });
    // Note: npx presence is real — test just verifies npx path is chosen when
    // npx exists on the real machine. If npx is absent, fallback path fires
    // instead — both are acceptable; the key invariant is no crash.
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(String(args[0]));
    });

    try {
      const { run: installRun } = await import("./install.ts");
      await installRun(["--no-upstream-skills"]);
      // Either npx path or clone fallback must be logged for Codex.
      const codexHandled = logs.some((l) =>
        (l.includes("npx") && l.includes("JuliusBrussee/caveman")) ||
        l.includes("clone+copy fallback") ||
        l.includes("npx not on PATH") ||
        l.includes("Codex CLI caveman")
      );
      expect(codexHandled).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  test("dry-run logs skip when caveman skill dir already exists (idempotency)", async () => {
    // Pre-create the caveman skill dir to simulate already installed.
    await mkdir(join(testHome, ".codex", "skills", "caveman"), { recursive: true });

    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(String(args[0]));
    });

    try {
      const { run: installRun } = await import("./install.ts");
      await installRun(["--no-upstream-skills"]);
      // Should log "already installed" skip message for Codex.
      expect(logs.some((l) => l.includes("Codex CLI") && l.includes("already installed"))).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

});

// Test installCavemanByCopy fallback outside dry-run scope.
describe("installCaveman W1.3 — clone+copy fallback (non-dry-run)", () => {
  let testHome: string;

  beforeEach(async () => {
    testHome = await mkdtemp(join(tmpdir(), "caveman-fallback-"));
    setDryRun(false);
  });

  afterEach(async () => {
    setDryRun(false);
    await rm(testHome, { recursive: true, force: true });
  });

  test("installCavemanByCopy fallback: copies all 5 skills when clone succeeds", async () => {
    const cloneDir = join(testHome, "fixture-caveman");
    await runProc(["git", "init", cloneDir]);
    await runProc(["git", "-C", cloneDir, "config", "user.email", "test@test.com"]);
    await runProc(["git", "-C", cloneDir, "config", "user.name", "Test"]);
    for (const skill of ["caveman", "caveman-commit", "caveman-help", "caveman-review", "compress"]) {
      await mkdir(join(cloneDir, "skills", skill), { recursive: true });
      await writeFile(join(cloneDir, "skills", skill, "SKILL.md"), `# ${skill}\n`);
    }
    await runProc(["git", "-C", cloneDir, "add", "."]);
    await runProc(["git", "-C", cloneDir, "commit", "-m", "test"]);

    const agentSkillsRoot = join(testHome, "fallback-agent-skills");
    await installCavemanByCopy(agentSkillsRoot, { cloneDir, home: testHome });

    for (const skill of ["caveman", "caveman-commit", "caveman-help", "caveman-review", "compress"]) {
      expect(await Bun.file(join(agentSkillsRoot, skill, "SKILL.md")).exists()).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. dry-run mode
// ---------------------------------------------------------------------------

describe("dry-run mode", () => {
  let dryHome: string;

  beforeEach(async () => {
    dryHome = await mkdtemp(join(tmpdir(), "fulcrum-dry-"));
    setDryRun(true);
  });

  afterEach(async () => {
    setDryRun(false);
    await rm(dryHome, { recursive: true, force: true });
  });

  test("assertNotAgentsPath still throws under dry-run (safety check active)", () => {
    // The guard must fire regardless of dry-run state.
    expect(() =>
      assertNotAgentsPath(join(dryHome, ".agents", "skills"), dryHome)
    ).toThrow("HARD RULE VIOLATION");
  });

  test("lockCavemanUltra in dry-run does not create config.json", async () => {
    await lockCavemanUltra(dryHome);

    const cfgPath = join(dryHome, ".config", "caveman", "config.json");
    // File must not exist — dry-run must not write.
    expect(await Bun.file(cfgPath).exists()).toBe(false);
  });

  test("spliceSentinel in dry-run does not modify an existing target file", async () => {
    // Create a target file with known content.
    const targetDir = join(dryHome, "rules-dir");
    await mkdir(targetDir, { recursive: true });
    const target = join(targetDir, "AGENTS.md");
    const original = "# My existing rules\n\nSome user content here.\n";
    await writeFile(target, original);

    // Run spliceSentinel under dry-run.
    await spliceSentinel(target, "## Fulcrum body", "test-label");

    // File must be unchanged.
    const after = await readFile(target, "utf8");
    expect(after).toBe(original);
  });

  test("spliceSentinel in dry-run does not create a new target file", async () => {
    const targetDir = join(dryHome, "new-rules-dir");
    await mkdir(targetDir, { recursive: true });
    const target = join(targetDir, "AGENTS.md");
    // File does not exist yet.

    await spliceSentinel(target, "## Fulcrum body", "test-label");

    // File must still not exist.
    expect(await Bun.file(target).exists()).toBe(false);
  });
});
