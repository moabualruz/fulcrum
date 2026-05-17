import { describe, expect, test } from "bun:test";

import { createTestOrm } from "@test-support/application-database.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Repo } from "@integration-hub/infrastructure/database/entities/repos/Repo.ts";
import { RepoRepository } from "@integration-hub/infrastructure/database/repositories/repos/RepoRepository.ts";

async function createOrg(em: import("typeorm").EntityManager, slug: string): Promise<Org> {
  const now = new Date();
  const org = em.create(Org, { name: slug, slug, createdAt: now, updatedAt: now });
  await em.save(org);
  return org;
}

function makeRepo(em: import("typeorm").EntityManager): RepoRepository {
  const inner = em.getRepository(Repo);
  const repo = Object.create(RepoRepository.prototype) as unknown as RepoRepository;
  Object.defineProperty(repo, "repos", { value: inner });
  return repo;
}

describe("RepoRepository", () => {
  test("creates and lists repos scoped to one org", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const repo = makeRepo(em);
      const orgA = await createOrg(em, "repo-repository-create-a");
      const orgB = await createOrg(em, "repo-repository-create-b");

      const alpha = await repo.create({
        orgId: orgA.id,
        name: "Alpha",
        slug: "same-slug",
        kind: "local",
        localPath: "/work/alpha",
      });
      await repo.create({
        orgId: orgB.id,
        name: "Beta",
        slug: "same-slug",
        kind: "remote",
        remoteUrl: "https://example.test/beta.git",
      });

      expect(alpha.org.id).toBe(orgA.id);
      expect(alpha.syncStatus).toBe("idle");
      expect(alpha.archived).toBe(false);

      const orgARepos = await repo.list({ orgId: orgA.id });
      expect(orgARepos.map((row) => row.id)).toEqual([alpha.id]);
      expect(orgARepos[0]?.org.id).toBe(orgA.id);
    } finally {
      await db.close();
    }
  });

  test("gets repos only inside the requested org", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const repo = makeRepo(em);
      const orgA = await createOrg(em, "repo-repository-get-a");
      const orgB = await createOrg(em, "repo-repository-get-b");
      const alpha = await repo.create({
        orgId: orgA.id,
        name: "Alpha",
        slug: "alpha-get",
        kind: "local",
      });

      expect(await repo.get({ orgId: orgA.id, id: alpha.id })).toMatchObject({
        id: alpha.id,
        slug: "alpha-get",
      });
      expect(await repo.get({ orgId: orgB.id, id: alpha.id })).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("updates repos only inside the requested org", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const repo = makeRepo(em);
      const orgA = await createOrg(em, "repo-repository-update-a");
      const orgB = await createOrg(em, "repo-repository-update-b");
      const alpha = await repo.create({
        orgId: orgA.id,
        name: "Alpha",
        slug: "alpha-update",
        kind: "local",
        defaultBranch: "main",
      });

      expect(await repo.update({ orgId: orgB.id, id: alpha.id, name: "Cross Org" })).toBeNull();

      const updated = await repo.update({
        orgId: orgA.id,
        id: alpha.id,
        name: "Alpha Renamed",
        slug: "alpha-renamed",
        currentBranch: "feature/repos",
      });

      expect(updated).toMatchObject({
        id: alpha.id,
        name: "Alpha Renamed",
        slug: "alpha-renamed",
        currentBranch: "feature/repos",
      });
      expect((await repo.get({ orgId: orgA.id, id: alpha.id }))?.name).toBe("Alpha Renamed");
    } finally {
      await db.close();
    }
  });

  test("archives repos only inside the requested org and hides them from default list", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const repo = makeRepo(em);
      const orgA = await createOrg(em, "repo-repository-archive-a");
      const orgB = await createOrg(em, "repo-repository-archive-b");
      const alpha = await repo.create({
        orgId: orgA.id,
        name: "Alpha",
        slug: "alpha-archive",
        kind: "local",
      });

      expect(await repo.archive({ orgId: orgB.id, id: alpha.id })).toBeNull();
      expect((await repo.get({ orgId: orgA.id, id: alpha.id }))?.archived).toBe(false);

      const archived = await repo.archive({ orgId: orgA.id, id: alpha.id });
      expect(archived?.archived).toBe(true);
      expect(await repo.list({ orgId: orgA.id })).toEqual([]);
      expect((await repo.list({ orgId: orgA.id, includeArchived: true })).map((row) => row.id)).toEqual([alpha.id]);
    } finally {
      await db.close();
    }
  });
});
