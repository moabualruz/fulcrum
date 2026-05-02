/**
 * TDD — skills loader per-agent install + hash verification.
 *
 * Closes (issue): .scratch/agent-os-vision/05-router-and-skills/issues/13-skills-loader-per-agent-install.md
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  createTestOrm,
  type TestOrm,
} from "../../src/test-utils/index.ts";
import { Org } from "../../src/db/entities/auth/Org.ts";
import {
  FulcrumSkill,
  SkillSource,
  SkillVersion,
} from "../../src/db/entities/skills/index.ts";
import {
  AGENT_DIRS,
  __setSkillsLoaderOrmForTest,
  installSkill,
} from "../../src/skills/loader.ts";
import { readSkillsLockFile } from "../../src/skills/lock.ts";

let scratch: string;
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;
let testDb: TestOrm;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-skills-loader-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = scratch;
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
  testDb = await createTestOrm();
  __setSkillsLoaderOrmForTest(testDb.orm);
});

afterEach(async () => {
  __setSkillsLoaderOrmForTest(undefined);
  await testDb.close();
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

async function writeSkill(
  slug: string,
  frontmatter: Record<string, unknown> | string,
): Promise<string> {
  const skillDir = join(scratch, "source", slug);
  await mkdir(skillDir, { recursive: true });
  const yaml = typeof frontmatter === "string"
    ? frontmatter
    : [
      `name: ${frontmatter["name"]}`,
      `version: ${frontmatter["version"]}`,
      `agents: ${JSON.stringify(frontmatter["agents"])}`,
      `triggers: ${JSON.stringify(frontmatter["triggers"] ?? [])}`,
    ].join("\n");
  const content = `---\n${yaml}\n---\n# ${slug}\n\nBody.\n`;
  const path = join(skillDir, "SKILL.md");
  await writeFile(path, content, "utf8");
  return path;
}

function resolveAgentDir(agent: keyof typeof AGENT_DIRS): string {
  return AGENT_DIRS[agent].replace(/^~/, scratch);
}

async function installedPath(agent: keyof typeof AGENT_DIRS, slug: string) {
  return join(resolveAgentDir(agent), slug, "SKILL.md");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function latestVersion(slug: string): Promise<SkillVersion | null> {
  const em = testDb.orm.em.fork();
  const skill = await em.findOne(
    FulcrumSkill,
    { org: testDb.seed.orgId, slug },
    { populate: ["versions"] },
  );
  return skill?.versions.getItems().at(-1) ?? null;
}

describe("installSkill", () => {
  it("copies agents ['claude','codex'] to exactly those two dirs", async () => {
    const skillPath = await writeSkill("pair", {
      name: "pair",
      version: "1.0.0",
      agents: ["claude", "codex"],
      triggers: ["pair"],
    });

    const skill = await installSkill(skillPath, testDb.seed.orgId);

    expect(skill.slug).toBe("pair");
    expect(await pathExists(await installedPath("claude", "pair"))).toBe(true);
    expect(await pathExists(await installedPath("codex", "pair"))).toBe(true);
    expect(await pathExists(await installedPath("gemini", "pair"))).toBe(false);
    expect(await pathExists(await installedPath("opencode", "pair"))).toBe(false);
    expect(await pathExists(await installedPath("pi", "pair"))).toBe(false);
  });

  it("copies agents ['*'] to all five dirs and records hash in DB and lock", async () => {
    const skillPath = await writeSkill("all-agents", {
      name: "all-agents",
      version: "1.0.0",
      agents: ["*"],
      triggers: ["all"],
    });
    const content = await readFile(skillPath, "utf8");
    const hash = createHash("sha256").update(content).digest("hex");

    await installSkill(skillPath, testDb.seed.orgId);

    for (const agent of Object.keys(AGENT_DIRS) as (keyof typeof AGENT_DIRS)[]) {
      expect(await pathExists(await installedPath(agent, "all-agents"))).toBe(true);
    }

    expect((await latestVersion("all-agents"))?.hashVerified).toBe(hash);
    const lock = await readSkillsLockFile({
      fulcrumHome: process.env["FULCRUM_HOME"],
    });
    expect(lock["all-agents"]?.hash).toBe(hash);
  });

  it("throws on reinstall when installed file hash differs and nulls DB hash", async () => {
    const skillPath = await writeSkill("tamper", {
      name: "tamper",
      version: "1.0.0",
      agents: ["codex"],
      triggers: ["tamper"],
    });
    await installSkill(skillPath, testDb.seed.orgId);
    await writeFile(await installedPath("codex", "tamper"), "tampered", "utf8");

    await expect(installSkill(skillPath, testDb.seed.orgId)).rejects.toThrow(
      /hash mismatch/i,
    );

    expect((await latestVersion("tamper"))?.hashVerified).toBeNull();
  });

  it("records a null DB hash when a first install fails during agent copy", async () => {
    const blockedHome = join(scratch, "blocked-home");
    await writeFile(blockedHome, "not a directory", "utf8");
    process.env["HOME"] = blockedHome;
    const skillPath = await writeSkill("copy-fail", {
      name: "copy-fail",
      version: "1.0.0",
      agents: ["codex"],
      triggers: ["copy-fail"],
    });

    await expect(installSkill(skillPath, testDb.seed.orgId)).rejects.toThrow();

    expect((await latestVersion("copy-fail"))?.hashVerified).toBeNull();
  });

  it("updates existing skill source to local on install", async () => {
    const em = testDb.orm.em.fork();
    em.create(FulcrumSkill, {
      org: em.getReference(Org, testDb.seed.orgId),
      name: "source",
      slug: "source",
      source: SkillSource.Upstream,
      enabledAgents: ["codex"],
    });
    await em.flush();
    const skillPath = await writeSkill("source", {
      name: "source",
      version: "1.0.0",
      agents: ["codex"],
      triggers: ["source"],
    });

    await installSkill(skillPath, testDb.seed.orgId);

    const reloaded = await testDb.orm.em.fork().findOneOrFail(FulcrumSkill, {
      org: testDb.seed.orgId,
      slug: "source",
    });
    expect(reloaded.source).toBe(SkillSource.Local);
  });

  it("rejects skill names that do not produce a filesystem-safe slug", async () => {
    const skillPath = await writeSkill("punctuation", [
      'name: "!!!"',
      "version: 1.0.0",
      'agents: ["codex"]',
      'triggers: ["punctuation"]',
    ].join("\n"));

    await expect(installSkill(skillPath, testDb.seed.orgId)).rejects.toThrow(
      /valid skill slug/i,
    );

    const em = testDb.orm.em.fork();
    expect(await em.count(FulcrumSkill, { org: testDb.seed.orgId })).toBe(0);
  });

  it("removes a stale skills lock owned by a dead process", async () => {
    const lockDir = join(process.env["FULCRUM_HOME"]!, "skills.lock.json.lock");
    await mkdir(lockDir, { recursive: true });
    await writeFile(
      join(lockDir, "lock.json"),
      JSON.stringify({ pid: 999_999_999, createdAt: new Date().toISOString() }),
      "utf8",
    );
    const skillPath = await writeSkill("stale-lock", {
      name: "stale-lock",
      version: "1.0.0",
      agents: ["codex"],
      triggers: ["stale-lock"],
    });

    await installSkill(skillPath, testDb.seed.orgId);

    expect(await pathExists(await installedPath("codex", "stale-lock"))).toBe(true);
    expect(await pathExists(lockDir)).toBe(false);
  });

  it("reinstalling the same content skips rewriting installed file", async () => {
    const skillPath = await writeSkill("stable", {
      name: "stable",
      version: "1.0.0",
      agents: ["codex"],
      triggers: ["stable"],
    });
    await installSkill(skillPath, testDb.seed.orgId);
    const target = await installedPath("codex", "stable");
    const before = await stat(target);

    await installSkill(skillPath, testDb.seed.orgId);

    const after = await stat(target);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it("logs and skips invalid SKILL.md frontmatter without writing a DB row", async () => {
    const skillPath = await writeSkill("broken", "name: [");

    await expect(installSkill(skillPath, testDb.seed.orgId)).rejects.toThrow();

    const em = testDb.orm.em.fork();
    expect(await em.count(FulcrumSkill, { org: testDb.seed.orgId })).toBe(0);
  });

  it("auto-creates a missing agent dir and installs successfully", async () => {
    const skillPath = await writeSkill("missing-dir", {
      name: "missing-dir",
      version: "1.0.0",
      agents: ["pi"],
      triggers: ["missing"],
    });

    expect(await pathExists(resolveAgentDir("pi"))).toBe(false);

    await installSkill(skillPath, testDb.seed.orgId);

    expect(await pathExists(resolveAgentDir("pi"))).toBe(true);
    expect(await pathExists(await installedPath("pi", "missing-dir"))).toBe(true);
  });
});
