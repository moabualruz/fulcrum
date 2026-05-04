/**
 * TDD — skills upstream conflict resolution.
 *
 * Closes (issue): .scratch/agent-os-vision/05-router-and-skills/issues/15-skills-conflict-resolver.md
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import {
  createTestOrm,
  type TestOrm,
} from "../../src/test-utils/index.ts";
import {
  FulcrumSkill,
  SkillSource,
} from "../../src/db/entities/skills/index.ts";
import {
  AGENT_DIRS,
  __setSkillsLoaderOrmForTest,
  installSkill,
} from "../../src/skills/loader.ts";
import { readSkillsLockFile, writeSkillsLockFile } from "../../src/skills/lock.ts";
import {
  __setSkillsConflictResolverOrmForTest,
  resolveConflict,
} from "../../src/skills/conflict-resolver.ts";

let scratch: string;
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;
let testDb: TestOrm;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-skills-conflicts-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = scratch;
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
  testDb = await createTestOrm();
  __setSkillsLoaderOrmForTest(testDb.orm);
  __setSkillsConflictResolverOrmForTest(testDb.orm);
});

afterEach(async () => {
  __setSkillsLoaderOrmForTest(undefined);
  __setSkillsConflictResolverOrmForTest(undefined);
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

async function markUpstream(slug: string, upstreamRepo: string): Promise<void> {
  const em = testDb.orm.em.fork();
  const skill = await em.findOneOrFail(FulcrumSkill, {
    org: testDb.seed.orgId,
    slug,
  });
  skill.source = SkillSource.Upstream;
  skill.upstreamRepo = upstreamRepo;
  await em.flush();
}

async function latestHashVerified(slug: string): Promise<string | null | undefined> {
  const em = testDb.orm.em.fork();
  const skill = await em.findOne(
    FulcrumSkill,
    { org: testDb.seed.orgId, slug },
    { populate: ["versions"] },
  );
  return skill?.versions.getItems().at(-1)?.hashVerified;
}

async function seedConflict(slug: string, initial: string): Promise<void> {
  const lock = await readSkillsLockFile({
    fulcrumHome: process.env["FULCRUM_HOME"],
  });
  lock[slug] = {
    ...lock[slug]!,
    hash: sha256(initial),
    upstream_conflict: "--- local\n+++ upstream\n",
  };
  await writeSkillsLockFile(lock, {
    fulcrumHome: process.env["FULCRUM_HOME"],
  });
}

describe("resolveConflict", () => {
  it("keep upstream overwrites installed skill, clears conflict, and updates hash_verified", async () => {
    const initial = skillContent("resolve-upstream", "1.0.0", "Initial body.");
    const localEdit = skillContent("resolve-upstream", "1.0.0", "Local edit.");
    const upstreamEdit = skillContent("resolve-upstream", "1.0.0", "Upstream edit.");
    await installSkill(await writeLocalSource("resolve-upstream", initial), testDb.seed.orgId);
    await writeFile(installedPath("resolve-upstream"), localEdit, "utf8");
    await markUpstream(
      "resolve-upstream",
      await createUpstreamRepo("resolve-upstream", upstreamEdit),
    );
    await seedConflict("resolve-upstream", initial);

    const skill = await resolveConflict(
      "resolve-upstream",
      "upstream",
      testDb.seed.orgId,
    );

    expect(skill.slug).toBe("resolve-upstream");
    expect(await readFile(installedPath("resolve-upstream"), "utf8")).toBe(upstreamEdit);
    expect(await latestHashVerified("resolve-upstream")).toBe(sha256(upstreamEdit));
    const lock = await readSkillsLockFile({
      fulcrumHome: process.env["FULCRUM_HOME"],
    });
    expect(lock["resolve-upstream"]?.hash).toBe(sha256(upstreamEdit));
    expect(lock["resolve-upstream"]?.upstream_conflict).toBeUndefined();
  });

  it("keep local clears conflict without changing installed skill or hash_verified", async () => {
    const initial = skillContent("resolve-local", "1.0.0", "Initial body.");
    const localEdit = skillContent("resolve-local", "1.0.0", "Local edit.");
    await installSkill(await writeLocalSource("resolve-local", initial), testDb.seed.orgId);
    await writeFile(installedPath("resolve-local"), localEdit, "utf8");
    await seedConflict("resolve-local", initial);

    await resolveConflict("resolve-local", "local", testDb.seed.orgId);

    expect(await readFile(installedPath("resolve-local"), "utf8")).toBe(localEdit);
    expect(await latestHashVerified("resolve-local")).toBe(sha256(initial));
    const lock = await readSkillsLockFile({
      fulcrumHome: process.env["FULCRUM_HOME"],
    });
    expect(lock["resolve-local"]?.hash).toBe(sha256(initial));
    expect(lock["resolve-local"]?.upstream_conflict).toBeUndefined();
  });

  it("resolving a skill with no conflict is a no-op that returns current skill", async () => {
    const initial = skillContent("resolve-noop", "1.0.0", "Initial body.");
    await installSkill(await writeLocalSource("resolve-noop", initial), testDb.seed.orgId);
    const before = await readFile(installedPath("resolve-noop"), "utf8");

    const skill = await resolveConflict("resolve-noop", "local", testDb.seed.orgId);

    expect(skill.slug).toBe("resolve-noop");
    expect(await readFile(installedPath("resolve-noop"), "utf8")).toBe(before);
    expect(await latestHashVerified("resolve-noop")).toBe(sha256(initial));
    const lock = await readSkillsLockFile({
      fulcrumHome: process.env["FULCRUM_HOME"],
    });
    expect(lock["resolve-noop"]?.upstream_conflict).toBeUndefined();
  });
});
