import { describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm } from "@test-support/application-database.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { upsertBitbucketPullRequest } from "@integration-hub/application/connectors/bitbucket/commands.ts";
import { getBitbucketPullRequest, listBitbucketPullRequests } from "@integration-hub/application/connectors/bitbucket/queries.ts";

const ctx = { orgId: DEFAULT_ORG_ID, userId: "user-connectors", projectId: "22222222-2222-4222-8222-222222222222" };

describe("application connectors bitbucket", () => {
  test("handles CRUD, not-found, validation, and scoping", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const created = await upsertBitbucketPullRequest(em, ctx, { repoSlug: "fulcrum", pullRequestId: "7", title: "Sync", state: "open" });
      expect(await listBitbucketPullRequests(em, ctx, { repoSlug: "fulcrum" })).toHaveLength(1);
      await expect(getBitbucketPullRequest(em, ctx, created.id)).resolves.toMatchObject({ id: created.id, title: "Sync" });
      await expect(getBitbucketPullRequest(em, ctx, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
      await expect(upsertBitbucketPullRequest(em, ctx, { repoSlug: "", pullRequestId: "", title: "", state: "open" })).rejects.toBeInstanceOf(AppValidationError);
    } finally {
      await db.close();
    }
  });
});
