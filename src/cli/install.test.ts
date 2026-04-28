// Tests for caveman install logic in install.ts.
// Uses Bun test runner; no GitHub network access (file:// fixture repo).

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertNotAgentsPath, installCavemanByCopy, lockCavemanUltra, spliceSentinel, setDryRun } from "./install.ts";
import { run as runProc } from "../utils/proc.ts";

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
