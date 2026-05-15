import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import {
  createTestOrm,
  type TestOrm,
} from "@test-support/index.ts";
import {
  FulcrumSkill,
  SkillSource,
} from "@platform-core/infrastructure/application-database/entities/skills/index.ts";
import {
  AGENT_DIRS,
  __setSkillsLoaderOrmForTest,
  installSkill,
} from "@platform-core/application/skill-supply/loader.ts";
import { readSkillsLockFile, writeSkillsLockFile } from "@platform-core/application/skill-supply/lock.ts";
import {
  __setSkillsConflictResolverOrmForTest,
  resolveConflict,
} from "@platform-core/application/skill-supply/conflict-resolver.ts";

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

  it("manual editor resolution reads edited installed content and updates lock + hash_verified", async () => {
    const originalEditor = process.env["EDITOR"];
    const initial = skillContent("resolve-editor", "1.0.0", "Initial body.");
    const edited = skillContent("resolve-editor", "2.0.0", "Edited body.");
    await installSkill(await writeLocalSource("resolve-editor", initial), testDb.seed.orgId);
    await seedConflict("resolve-editor", initial);
    const editorPath = join(scratch, "editor.sh");
    const editedPath = join(scratch, "edited-skill.md");
    await writeFile(editedPath, edited, "utf8");
    await writeFile(editorPath, [
      "#!/bin/sh",
      `cp ${JSON.stringify(editedPath)} "$1"`,
      "",
    ].join("\n"), "utf8");
    await $`chmod +x ${editorPath}`;
    process.env["EDITOR"] = editorPath;

    try {
      const skill = await resolveConflict("resolve-editor", "editor", testDb.seed.orgId);

      expect(skill.slug).toBe("resolve-editor");
      expect(await readFile(installedPath("resolve-editor"), "utf8")).toBe(edited);
      expect(await latestHashVerified("resolve-editor")).toBe(sha256(edited));
      const lock = await readSkillsLockFile({
        fulcrumHome: process.env["FULCRUM_HOME"],
      });
      expect(lock["resolve-editor"]?.hash).toBe(sha256(edited));
      expect(lock["resolve-editor"]?.version).toBe("2.0.0");
      expect(lock["resolve-editor"]?.upstream_conflict).toBeUndefined();
    } finally {
      if (originalEditor === undefined) delete process.env["EDITOR"];
      else process.env["EDITOR"] = originalEditor;
    }
  });

  it("rejects editor resolution when EDITOR is missing or exits non-zero", async () => {
    const originalEditor = process.env["EDITOR"];
    const initial = skillContent("resolve-editor-failure", "1.0.0", "Initial body.");
    await installSkill(await writeLocalSource("resolve-editor-failure", initial), testDb.seed.orgId);
    await seedConflict("resolve-editor-failure", initial);
    delete process.env["EDITOR"];

    try {
      await expect(resolveConflict("resolve-editor-failure", "editor", testDb.seed.orgId)).rejects.toThrow(
        /EDITOR is required/,
      );

      const failingEditor = join(scratch, "failing-editor.sh");
      await writeFile(failingEditor, "#!/bin/sh\nexit 7\n", "utf8");
      await $`chmod +x ${failingEditor}`;
      process.env["EDITOR"] = failingEditor;
      await expect(resolveConflict("resolve-editor-failure", "editor", testDb.seed.orgId)).rejects.toThrow(
        /EDITOR exited 7/,
      );

      expect(await readFile(installedPath("resolve-editor-failure"), "utf8")).toBe(initial);
      const lock = await readSkillsLockFile({
        fulcrumHome: process.env["FULCRUM_HOME"],
      });
      expect(lock["resolve-editor-failure"]?.upstream_conflict).toBeDefined();
    } finally {
      if (originalEditor === undefined) delete process.env["EDITOR"];
      else process.env["EDITOR"] = originalEditor;
    }
  });

  it("rejects upstream resolution when upstream metadata or upstream skill file is missing", async () => {
    const noRepo = skillContent("resolve-upstream-no-repo", "1.0.0", "Initial body.");
    await installSkill(await writeLocalSource("resolve-upstream-no-repo", noRepo), testDb.seed.orgId);
    await seedConflict("resolve-upstream-no-repo", noRepo);
    await expect(resolveConflict("resolve-upstream-no-repo", "upstream", testDb.seed.orgId)).rejects.toThrow(
      /missing upstream_repo/,
    );

    const missingFile = skillContent("resolve-upstream-no-file", "1.0.0", "Initial body.");
    await installSkill(await writeLocalSource("resolve-upstream-no-file", missingFile), testDb.seed.orgId);
    await markUpstream(
      "resolve-upstream-no-file",
      await createUpstreamRepo("different-skill", skillContent("different-skill", "2.0.0", "Other.")),
    );
    await seedConflict("resolve-upstream-no-file", missingFile);

    await expect(resolveConflict("resolve-upstream-no-file", "upstream", testDb.seed.orgId)).rejects.toThrow(
      /missing SKILL\.md/,
    );
    expect(await readFile(installedPath("resolve-upstream-no-file"), "utf8")).toBe(missingFile);
  });

  it("rejects conflict resolution when lock agents exclude every supported installer", async () => {
    const initial = skillContent("resolve-no-agent", "1.0.0", "Initial body.");
    await installSkill(await writeLocalSource("resolve-no-agent", initial), testDb.seed.orgId);
    const lock = await readSkillsLockFile({
      fulcrumHome: process.env["FULCRUM_HOME"],
    });
    lock["resolve-no-agent"] = {
      ...lock["resolve-no-agent"]!,
      hash: sha256(initial),
      upstream_conflict: "--- local\n+++ upstream\n",
      enabled_agents: ["unsupported-agent" as never],
    };
    await writeSkillsLockFile(lock, {
      fulcrumHome: process.env["FULCRUM_HOME"],
    });

    await expect(resolveConflict("resolve-no-agent", "editor", testDb.seed.orgId)).rejects.toThrow(
      /no enabled agents/,
    );
  });
});
