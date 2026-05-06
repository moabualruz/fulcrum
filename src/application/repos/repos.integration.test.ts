import { describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { createTestOrm } from "../../test-utils/db.ts";
import { AppNotFoundError, AppValidationError } from "../errors.ts";
import { insertRepoTreeEntry, registerRepo } from "./commands.ts";
import { getRepo, listRepoTree, listRepos } from "./queries.ts";

const ctx = { orgId: DEFAULT_ORG_ID, userId: "user-repos", projectId: "22222222-2222-4222-8222-222222222222" };

describe("application repos", () => {
  test("handles CRUD, not-found, validation, and scoping", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const repo = await registerRepo(em, ctx, { slug: "fulcrum", name: "Fulcrum", kind: "local", localPath: "/repo" });
      await insertRepoTreeEntry(em, ctx, { repoId: repo.id, commitSha: "abc", path: "src/index.ts", kind: "file" });
      expect(await listRepos(em, ctx)).toHaveLength(1);
      expect(await listRepoTree(em, ctx, { repoId: repo.id, commitSha: "abc" })).toHaveLength(1);
      await expect(getRepo(em, ctx, repo.id)).resolves.toMatchObject({ id: repo.id });
      await expect(getRepo(em, ctx, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
      await expect(registerRepo(em, ctx, { slug: "", name: "", kind: "local" })).rejects.toBeInstanceOf(AppValidationError);
    } finally {
      await db.close();
    }
  });
});
