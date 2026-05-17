import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { $ } from "bun";
import {
  createTestOrm,
  type TestOrm,
} from "@test-support/index.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import {
  FulcrumSkill,
  SkillConflict,
  SkillConflictKind,
  SkillConflictStatus,
  SkillSource,
  SkillVersion,
} from "@platform-core/infrastructure/application-database/entities/skills/index.ts";
import {
  AGENT_DIRS,
  __setSkillsLoaderOrmForTest,
  installSkill,
} from "@platform-core/application/skill-supply/loader.ts";
import { readSkillsLockFile, writeSkillsLockFile } from "@platform-core/application/skill-supply/lock.ts";
import {
  __setSkillsUpstreamSyncOrmForTest,
  syncUpstream,
  upgradeSkills,
} from "@platform-core/application/skill-supply/upstream-sync.ts";

let scratch: string;
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;
let testDb: TestOrm;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-skills-upstream-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = scratch;
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
  testDb = await createTestOrm();
  __setSkillsLoaderOrmForTest(testDb.ds);
  __setSkillsUpstreamSyncOrmForTest(testDb.ds);
});

afterEach(async () => {
  __setSkillsLoaderOrmForTest(undefined);
  __setSkillsUpstreamSyncOrmForTest(undefined);
  await testDb.close();
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

function skillContent(slug: string, version: string, body: string): string {
  return [
    "---",
    `name: ${slug}`,
    `version: ${version}`,
    'agents: ["codex"]',
    `triggers: ["${slug}"]`,
    "---",
    `# ${slug}`,
    "",
    body,
    "",
  ].join("\n");
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function installedPath(slug: string): string {
  return join(AGENT_DIRS.codex.replace(/^~/, scratch), slug, "SKILL.md");
}

async function writeLocalSource(slug: string, content: string): Promise<string> {
  const dir = join(scratch, "local-source", slug);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "SKILL.md");
  await writeFile(path, content, "utf8");
  return path;
}

async function createUpstreamRepo(slug: string, content: string): Promise<string> {
  const repo = join(scratch, "upstream", slug);
  await mkdir(join(repo, "skills", slug), { recursive: true });
  await writeFile(join(repo, "skills", slug, "SKILL.md"), content, "utf8");
  await $`git init --quiet ${repo}`;
  await $`git -C ${repo} add skills/${slug}/SKILL.md`;
  await $`git -C ${repo} -c user.name=Fulcrum -c user.email=fulcrum@local commit --quiet -m "seed ${slug}"`;
  return repo;
}

async function createUpstreamRepoWithPath(
  slug: string,
  relativePath: string,
  content: string,
): Promise<string> {
  const repo = join(scratch, "upstream", slug);
  await mkdir(join(repo, relativePath, ".."), { recursive: true });
  await writeFile(join(repo, relativePath), content, "utf8");
  await $`git init --quiet ${repo}`;
  await $`git -C ${repo} add .`;
  await $`git -C ${repo} -c user.name=Fulcrum -c user.email=fulcrum@local commit --quiet -m "seed ${slug}"`;
  return repo;
}

async function markUpstream(slug: string, upstreamRepo: string): Promise<void> {
  const em = testDb.em;
  const skill = await em.findOneOrFail(FulcrumSkill, {
    org: testDb.seed.orgId,
    slug,
  });
  skill.source = SkillSource.Upstream;
  skill.upstreamRepo = upstreamRepo;
  await em.save(skill);
}

async function latestHashVerified(slug: string): Promise<string | null | undefined> {
  const em = testDb.em;
  const skill = await em.findOne(
    FulcrumSkill,
    { org: testDb.seed.orgId, slug },
    { relations: ["versions"] },
  );
  const versions = skill?.versions ?? [];
  return versions.at(-1)?.hashVerified;
}

describe("syncUpstream", () => {
  it("returns an empty result without touching ORM or lock state when fetch is disabled", async () => {
    const initial = skillContent("upstream-disabled", "1.0.0", "Initial body.");
    await installSkill(await writeLocalSource("upstream-disabled", initial), testDb.seed.orgId);

    const result = await syncUpstream(testDb.seed.orgId, {
      fetchUpstream: false,
    });

    expect(result).toEqual({ merged: [], conflicts: [], errors: [] });
    expect(await readFile(installedPath("upstream-disabled"), "utf8")).toBe(initial);
    const lock = await readSkillsLockFile({
      fulcrumHome: process.env["FULCRUM_HOME"],
    });
    expect(lock["upstream-disabled"]?.hash).toBe(sha256(initial));
  });

  it("auto-merges a clean skill and updates lock + hash_verified", async () => {
    const initial = skillContent("upstream-clean", "1.0.0", "Initial body.");
    const updated = skillContent("upstream-clean", "1.0.0", "Updated body.");
    const localPath = await writeLocalSource("upstream-clean", initial);
    await installSkill(localPath, testDb.seed.orgId);
    const upstreamRepo = await createUpstreamRepo("upstream-clean", updated);
    await markUpstream("upstream-clean", upstreamRepo);

    const result = await syncUpstream(testDb.seed.orgId, {
      fetchUpstream: true,
    });

    expect(result).toEqual({
      merged: ["upstream-clean"],
      conflicts: [],
      errors: [],
    });
    expect(await readFile(installedPath("upstream-clean"), "utf8")).toBe(updated);
    expect(await latestHashVerified("upstream-clean")).toBe(sha256(updated));
    const lock = await readSkillsLockFile({
      fulcrumHome: process.env["FULCRUM_HOME"],
    });
    expect(lock["upstream-clean"]?.hash).toBe(sha256(updated));
    expect(lock["upstream-clean"]?.upstream_conflict).toBeUndefined();
  });

  it("writes upstream_conflict and leaves locally edited skill untouched", async () => {
    const initial = skillContent("upstream-conflict", "1.0.0", "Initial body.");
    const localEdit = skillContent("upstream-conflict", "1.0.0", "Local edit.");
    const upstreamEdit = skillContent("upstream-conflict", "1.0.0", "Upstream edit.");
    const localPath = await writeLocalSource("upstream-conflict", initial);
    await installSkill(localPath, testDb.seed.orgId);
    await writeFile(installedPath("upstream-conflict"), localEdit, "utf8");
    const upstreamRepo = await createUpstreamRepo("upstream-conflict", upstreamEdit);
    await markUpstream("upstream-conflict", upstreamRepo);

    const result = await syncUpstream(testDb.seed.orgId, {
      fetchUpstream: true,
    });

    expect(result).toEqual({
      merged: [],
      conflicts: ["upstream-conflict"],
      errors: [],
    });
    expect(await readFile(installedPath("upstream-conflict"), "utf8")).toBe(localEdit);
    expect(await latestHashVerified("upstream-conflict")).toBe(sha256(initial));
    const lock = await readSkillsLockFile({
      fulcrumHome: process.env["FULCRUM_HOME"],
    });
    expect(lock["upstream-conflict"]?.hash).toBe(sha256(initial));
    expect(lock["upstream-conflict"]?.upstream_conflict).toContain("Upstream edit.");
    expect(lock["upstream-conflict"]?.upstream_conflict).toContain("Local edit.");

    const em = testDb.em;
    const conflict = await em.findOneOrFail(SkillConflict, {
      slug: "upstream-conflict",
      kind: SkillConflictKind.UpstreamConflict,
      status: SkillConflictStatus.Open,
    });
    expect(conflict.localHash).toBe(sha256(localEdit));
    expect(conflict.upstreamHash).toBe(sha256(upstreamEdit));
    expect(conflict.baseHash).toBe(sha256(initial));
  });

  it("records unreachable upstream as error and preserves local skill + valid lock", async () => {
    const initial = skillContent("upstream-missing", "1.0.0", "Initial body.");
    const localPath = await writeLocalSource("upstream-missing", initial);
    await installSkill(localPath, testDb.seed.orgId);
    await markUpstream(
      "upstream-missing",
      join(scratch, "missing-upstream-repo"),
    );

    const result = await syncUpstream(testDb.seed.orgId, {
      fetchUpstream: true,
    });

    expect(result).toEqual({
      merged: [],
      conflicts: [],
      errors: ["upstream-missing"],
    });
    expect(await readFile(installedPath("upstream-missing"), "utf8")).toBe(initial);
    const lock = await readSkillsLockFile({
      fulcrumHome: process.env["FULCRUM_HOME"],
    });
    expect(lock["upstream-missing"]?.hash).toBe(sha256(initial));
    expect(lock["upstream-missing"]?.upstream_conflict).toBeUndefined();
  });

  it("records missing lock entries or upstream repo metadata as sync errors", async () => {
    const noRepo = skillContent("upstream-no-repo", "1.0.0", "Initial body.");
    await installSkill(await writeLocalSource("upstream-no-repo", noRepo), testDb.seed.orgId);
    const em = testDb.em;
    const skill = await em.findOneOrFail(FulcrumSkill, {
      org: testDb.seed.orgId,
      slug: "upstream-no-repo",
    });
    skill.source = SkillSource.Upstream;
    await em.save(skill);

    const noLock = skillContent("upstream-no-lock", "1.0.0", "Initial body.");
    await installSkill(await writeLocalSource("upstream-no-lock", noLock), testDb.seed.orgId);
    await markUpstream(
      "upstream-no-lock",
      await createUpstreamRepo("upstream-no-lock", noLock),
    );
    const lock = await readSkillsLockFile({
      fulcrumHome: process.env["FULCRUM_HOME"],
    });
    delete lock["upstream-no-lock"];
    await writeSkillsLockFile(lock, {
      fulcrumHome: process.env["FULCRUM_HOME"],
    });

    const result = await syncUpstream(testDb.seed.orgId, {
      fetchUpstream: true,
    });

    expect(result.merged).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.errors.sort()).toEqual(["upstream-no-lock", "upstream-no-repo"]);
  });

  it("records malformed or missing upstream skill files as errors without corrupting local installs", async () => {
    const initial = skillContent("upstream-bad-frontmatter", "1.0.0", "Initial body.");
    await installSkill(await writeLocalSource("upstream-bad-frontmatter", initial), testDb.seed.orgId);
    await markUpstream(
      "upstream-bad-frontmatter",
      await createUpstreamRepo("upstream-bad-frontmatter", "---\nname: upstream-bad-frontmatter\n---\n# Missing Version\n"),
    );

    const missingFile = skillContent("upstream-no-skill-md", "1.0.0", "Initial body.");
    await installSkill(await writeLocalSource("upstream-no-skill-md", missingFile), testDb.seed.orgId);
    await markUpstream(
      "upstream-no-skill-md",
      await createUpstreamRepoWithPath("upstream-no-skill-md", "docs/README.md", "# no skill here\n"),
    );

    const result = await syncUpstream(testDb.seed.orgId, {
      fetchUpstream: true,
    });

    expect(result.merged).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.errors.sort()).toEqual(["upstream-bad-frontmatter", "upstream-no-skill-md"]);
    expect(await readFile(installedPath("upstream-bad-frontmatter"), "utf8")).toBe(initial);
    expect(await readFile(installedPath("upstream-no-skill-md"), "utf8")).toBe(missingFile);
  });
});

describe("upgradeSkills", () => {
  it("upgrades all or one upstream skill from real local git repos and preserves upstream metadata", async () => {
    const alphaInitial = skillContent("upgrade-alpha", "1.0.0", "Initial alpha.");
    const alphaUpgrade = skillContent("upgrade-alpha", "2.0.0", "Upgraded alpha.");
    const betaInitial = skillContent("upgrade-beta", "1.0.0", "Initial beta.");
    const betaUpgrade = skillContent("upgrade-beta", "2.0.0", "Upgraded beta.");
    await installSkill(await writeLocalSource("upgrade-alpha", alphaInitial), testDb.seed.orgId);
    await installSkill(await writeLocalSource("upgrade-beta", betaInitial), testDb.seed.orgId);
    const alphaRepo = await createUpstreamRepo("upgrade-alpha", alphaUpgrade);
    const betaRepo = await createUpstreamRepo("upgrade-beta", betaUpgrade);
    await markUpstream("upgrade-alpha", alphaRepo);
    await markUpstream("upgrade-beta", betaRepo);

    const onlyAlpha = await upgradeSkills(testDb.seed.orgId, "upgrade-alpha");

    expect(onlyAlpha.map((skill) => skill.slug)).toEqual(["upgrade-alpha"]);
    expect(await readFile(installedPath("upgrade-alpha"), "utf8")).toBe(alphaUpgrade);
    expect(await readFile(installedPath("upgrade-beta"), "utf8")).toBe(betaInitial);

    const all = await upgradeSkills(testDb.seed.orgId, "all");
    expect(all.map((skill) => skill.slug).sort()).toEqual(["upgrade-alpha", "upgrade-beta"]);
    expect(await readFile(installedPath("upgrade-beta"), "utf8")).toBe(betaUpgrade);

    const em = testDb.em;
    const alpha = await em.findOneOrFail(FulcrumSkill, {
      org: testDb.seed.orgId,
      slug: "upgrade-alpha",
    });
    expect(alpha.source).toBe(SkillSource.Upstream);
    expect(alpha.upstreamRepo).toBe(alphaRepo);
  });

  it("skips local skills and always removes temporary upgrade clones", async () => {
    const local = skillContent("upgrade-local", "1.0.0", "Local body.");
    await installSkill(await writeLocalSource("upgrade-local", local), testDb.seed.orgId);

    const upgraded = await upgradeSkills(testDb.seed.orgId, "all");

    expect(upgraded).toEqual([]);
    expect(await readFile(installedPath("upgrade-local"), "utf8")).toBe(local);
  });
});
