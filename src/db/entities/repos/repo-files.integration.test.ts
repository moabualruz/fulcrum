import { afterEach, describe, expect, it } from "bun:test";

import { createTestOrm, type TestOrm } from "../../../test-utils/db.ts";
import { Org } from "../auth/Org.ts";
import { Repo, RepoBlameLine, RepoTreeEntry } from "./index.ts";

let db: TestOrm | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function setup(): Promise<{ db: TestOrm; org: Org; repo: Repo }> {
  db = await createTestOrm();
  const org = await db.em.findOneOrFail(Org, { id: db.seed.orgId });
  const repo = db.em.create(Repo, {
    org,
    name: "Fulcrum",
    slug: "fulcrum-repo-files",
    kind: "local",
    localPath: "/tmp/fulcrum",
  });
  await db.em.persistAndFlush(repo);
  return { db, org, repo };
}

describe("repo file MikroORM entities", () => {
  it("persists and reloads RepoTreeEntry with org/project/repo FKs", async () => {
    const { db, org, repo } = await setup();

    const entry = db.em.create(RepoTreeEntry, {
      org,
      projectId: "project-files",
      repo,
      commitSha: "abc123",
      path: "src/index.ts",
      kind: "file",
      size: 512,
      contentHash: "sha256:abc123",
    });

    await db.em.persistAndFlush(entry);
    db.em.clear();

    const reloaded = await db.em.findOneOrFail(RepoTreeEntry, {
      path: "src/index.ts",
    }, { populate: ["org", "repo"] });

    expect(reloaded.org.id).toBe(org.id);
    expect(reloaded.projectId).toBe("project-files");
    expect(reloaded.repo.id).toBe(repo.id);
  });

  it("persists and reloads RepoBlameLine with org/project/repo FKs", async () => {
    const { db, org, repo } = await setup();

    const blame = db.em.create(RepoBlameLine, {
      org,
      projectId: "project-files",
      repo,
      path: "src/index.ts",
      lineNumber: 7,
      commitSha: "def456",
      authorName: "Ada Lovelace",
      authorEmail: "ada@example.com",
      committedAt: new Date("2026-05-06T00:00:00Z"),
    });

    await db.em.persistAndFlush(blame);
    db.em.clear();

    const reloaded = await db.em.findOneOrFail(RepoBlameLine, {
      path: "src/index.ts",
      lineNumber: 7,
    }, { populate: ["org", "repo"] });

    expect(reloaded.org.id).toBe(org.id);
    expect(reloaded.projectId).toBe("project-files");
    expect(reloaded.repo.id).toBe(repo.id);
  });
});
