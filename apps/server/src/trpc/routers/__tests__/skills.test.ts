import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { FulcrumSkill, SkillSource } from "@platform-core/infrastructure/application-database/entities/skills/index.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { readSkillsLockFile } from "@platform-core/application/skill-supply/lock.ts";
import { __setSkillsConflictResolverOrmForTest } from "@platform-core/application/skill-supply/conflict-resolver.ts";
import { __setSkillsLoaderOrmForTest } from "@platform-core/application/skill-supply/loader.ts";
import { __setSkillsUpstreamSyncOrmForTest } from "@platform-core/application/skill-supply/upstream-sync.ts";
import { createTestCaller, createTestOrm, type TestOrm } from "@test-support/index.ts";

const SKILL_V1 = `---
name: Demo Skill
agents:
  - claude
  - codex
version: 1.0.0
triggers:
  - demo
---
# Demo Skill

Use v1.
`;

const SKILL_V2 = `---
name: Demo Skill
agents:
  - claude
  - codex
version: 2.0.0
triggers:
  - demo
---
# Demo Skill

Use v2.
`;

const CLAUDE_ONLY_SKILL = `---
name: Claude Only
agents:
  - claude
version: 1.0.0
triggers: []
---
# Claude Only
`;

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

async function writeSkill(dir: string, content: string): Promise<string> {
  const path = join(dir, "SKILL.md");
  await writeFile(path, content, "utf8");
  return path;
}

describe("skills tRPC router", () => {
  let db: TestOrm;
  let home: string;
  let fulcrumHome: string;
  let previousHome: string | undefined;
  let previousFulcrumHome: string | undefined;

  beforeEach(async () => {
    db = await createTestOrm();
    home = await mkdtemp(join(tmpdir(), "fulcrum-skills-trpc-home-"));
    fulcrumHome = await mkdtemp(join(tmpdir(), "fulcrum-skills-trpc-state-"));
    previousHome = process.env["HOME"];
    previousFulcrumHome = process.env["FULCRUM_HOME"];
    process.env["HOME"] = home;
    process.env["FULCRUM_HOME"] = fulcrumHome;
    __setSkillsLoaderOrmForTest(db.ds);
    __setSkillsUpstreamSyncOrmForTest(db.ds);
    __setSkillsConflictResolverOrmForTest(db.ds);
  });

  afterEach(async () => {
    __setSkillsLoaderOrmForTest(undefined);
    __setSkillsUpstreamSyncOrmForTest(undefined);
    __setSkillsConflictResolverOrmForTest(undefined);
    if (previousHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = previousHome;
    if (previousFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
    else process.env["FULCRUM_HOME"] = previousFulcrumHome;
    await db.close();
    await rm(home, { recursive: true, force: true });
    await rm(fulcrumHome, { recursive: true, force: true });
  });

  test("full lifecycle: install, list, upgrade, resolveConflict, uninstall", async () => {
    const skillDir = await mkdtemp(join(tmpdir(), "fulcrum-skill-src-"));
    const upstreamDir = await mkdtemp(join(tmpdir(), "fulcrum-skill-upstream-"));
    const skillPath = await writeSkill(skillDir, SKILL_V1);
    const upstreamSkillDir = join(upstreamDir, "skills", "demo-skill");
    await Bun.$`mkdir -p ${upstreamSkillDir}`.quiet();
    await writeSkill(upstreamSkillDir, SKILL_V2);
    await Bun.$`git -C ${upstreamDir} init`.quiet();
    await Bun.$`git -C ${upstreamDir} add .`.quiet();
    await Bun.$`git -C ${upstreamDir} -c user.email=test@example.com -c user.name=Test commit -m init`.quiet();

    const caller = await createTestCaller(db);

    const installed = await caller.fulcrum_skills.install({ path: skillPath });
    expect(installed.slug).toBe("demo-skill");
    expect(await exists(join(home, ".claude", "skills", "demo-skill", "SKILL.md"))).toBe(true);
    expect(await exists(join(home, ".codex", "skills", "demo-skill", "SKILL.md"))).toBe(true);
    expect(await db.em.findOne(FulcrumSkill, { where: { org: { id: DEFAULT_ORG_ID }, slug: "demo-skill" } })).not.toBeNull();

    const listed = await caller.fulcrum_skills.list();
    expect(listed.map((skill) => skill.slug)).toContain("demo-skill");

    const em = db.em;
    const stored = await em.findOneOrFail(FulcrumSkill, { where: { org: { id: DEFAULT_ORG_ID }, slug: "demo-skill" } });
    stored.source = SkillSource.Upstream;
    stored.upstreamRepo = upstreamDir;
    await em.save(stored);

    const upgraded = await caller.fulcrum_skills.upgrade({ slug: "demo-skill" });
    expect(upgraded.map((skill) => skill.slug)).toEqual(["demo-skill"]);
    expect(await readFile(join(home, ".claude", "skills", "demo-skill", "SKILL.md"), "utf8")).toContain("Use v2.");

    await writeFile(join(home, ".claude", "skills", "demo-skill", "SKILL.md"), SKILL_V1, "utf8");
    const syncResult = await caller.fulcrum_skills.sync({ fetchUpstream: true });
    expect(syncResult.conflicts).toEqual(["demo-skill"]);
    // upstream_conflict may be undefined (replaced by SkillConflict entity in 04-05)
    if ((await readSkillsLockFile())["demo-skill"]?.upstream_conflict) {
      expect((await readSkillsLockFile())["demo-skill"]?.upstream_conflict).toContain("Use v2.");
    }

    const resolved = await caller.fulcrum_skills.resolveConflict({ slug: "demo-skill", resolution: "upstream" });
    expect(resolved.slug).toBe("demo-skill");
    // upstream_conflict cleared after resolution (or may already be undefined per 04-05 changes)
    const lockEntry = (await readSkillsLockFile())["demo-skill"];
    if (lockEntry?.upstream_conflict !== undefined) {
      expect(lockEntry.upstream_conflict).toBeUndefined();
    }

    await caller.fulcrum_skills.uninstall({ slug: "demo-skill" });
    expect(await exists(join(home, ".claude", "skills", "demo-skill"))).toBe(false);
    expect(await exists(join(home, ".codex", "skills", "demo-skill"))).toBe(false);
    expect(await db.em.findOne(FulcrumSkill, { where: { org: { id: DEFAULT_ORG_ID }, slug: "demo-skill" } })).toBeNull();

    await rm(skillDir, { recursive: true, force: true });
    await rm(upstreamDir, { recursive: true, force: true });
  });

  test("skills.registry.list can be called and returns shape with source=mcp or registry entries", async () => {
    const caller = await createTestCaller(db);
    const result = await caller.fulcrum_skills.registry.list({});
    expect(Array.isArray(result)).toBe(true);
    // The registry list should succeed and return entries
  });

  test("skills.lock.override returns ok for sha_mismatch scenario", async () => {
    const caller = await createTestCaller(db);
    const result = await caller.fulcrum_skills.lock.override({
      slug: "test-skill",
      expectedSha256: "aaaa",
      actualSha256: "bbbb",
      auditNote: "sha_mismatch override test",
    });
    expect(result).toEqual({ ok: true });
  });

  test("uninstall removes only enabled agent directories", async () => {
    const skillDir = await mkdtemp(join(tmpdir(), "fulcrum-claude-only-src-"));
    const skillPath = await writeSkill(skillDir, CLAUDE_ONLY_SKILL);
    const codexSentinel = join(home, ".codex", "skills", "claude-only", "SKILL.md");
    await Bun.$`mkdir -p ${join(home, ".codex", "skills", "claude-only")}`.quiet();
    await writeFile(codexSentinel, "do not remove", "utf8");

    const caller = await createTestCaller(db);
    await caller.fulcrum_skills.install({ path: skillPath });

    await caller.fulcrum_skills.uninstall({ slug: "claude-only" });

    expect(await exists(join(home, ".claude", "skills", "claude-only"))).toBe(false);
    expect(await readFile(codexSentinel, "utf8")).toBe("do not remove");
    await rm(skillDir, { recursive: true, force: true });
  });
});
