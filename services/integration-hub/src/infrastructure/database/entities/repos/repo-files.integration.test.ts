import { afterEach, describe, expect, it } from "bun:test";
import type { EntityManager } from "typeorm";

import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Repo, RepoBlameLine, RepoTreeEntry } from "./index.ts";

let db: TestOrm | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function setup(): Promise<{ db: TestOrm; em: EntityManager; org: Org; repo: Repo }> {
  db = await createTestOrm();
  const em = db.em;
  const org = await em.findOneOrFail(Org, { where: { id: db.seed.orgId } });
  const repo = em.create(Repo, {
    org,
    name: "Fulcrum",
    slug: "fulcrum-repo-files",
    kind: "local",
    localPath: "/tmp/fulcrum",
  });
  await em.save(repo);
  return { db, em, org, repo };
}

describe("repo file entities", () => {
  it("persists and reloads RepoTreeEntry with org/project/repo FKs", async () => {
    const { em, org, repo } = await setup();

    const entry = em.create(RepoTreeEntry, {
      org,
      projectId: "project-files",
      repo,
      commitSha: "abc123",
      path: "apps/cli/src/main.ts",
      kind: "file",
      size: 512,
      contentHash: "sha256:abc123",
    });
    await em.save(entry);

    const reloaded = await em.findOneOrFail(RepoTreeEntry, {
      where: { path: "apps/cli/src/main.ts" },
      relations: { org: true, repo: true },
    });

    expect(reloaded.org.id).toBe(org.id);
    expect(reloaded.projectId).toBe("project-files");
    expect(reloaded.repo.id).toBe(repo.id);
  });

  it("persists and reloads RepoBlameLine with org/project/repo FKs", async () => {
    const { em, org, repo } = await setup();

    const blame = em.create(RepoBlameLine, {
      org,
      projectId: "project-files",
      repo,
      path: "apps/cli/src/main.ts",
      lineNumber: 7,
      commitSha: "def456",
      authorName: "Ada Lovelace",
      authorEmail: "ada@example.com",
      committedAt: new Date("2026-05-06T00:00:00Z"),
    });
    await em.save(blame);

    const reloaded = await em.findOneOrFail(RepoBlameLine, {
      where: { path: "apps/cli/src/main.ts", lineNumber: 7 },
      relations: { org: true, repo: true },
    });

    expect(reloaded.org.id).toBe(org.id);
    expect(reloaded.projectId).toBe("project-files");
    expect(reloaded.repo.id).toBe(repo.id);
  });
});
