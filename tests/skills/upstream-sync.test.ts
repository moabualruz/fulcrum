/**
 * TDD — skills upstream sync auto-merge + conflict lock.
 *
 * Closes (issue): .scratch/agent-os-vision/05-router-and-skills/issues/14-skills-upstream-sync.md
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { $ } from "bun";
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
import {
  __setSkillsUpstreamSyncOrmForTest,
  syncUpstream,
} from "../../src/skills/upstream-sync.ts";

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
  __setSkillsLoaderOrmForTest(testDb.orm);
  __setSkillsUpstreamSyncOrmForTest(testDb.orm);
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

describe("syncUpstream", () => {
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
});
