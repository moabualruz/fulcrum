import { describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm } from "@test-support/application-database.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { upsertGitlabMergeRequest } from "@integration-hub/application/connectors/gitlab/commands.ts";
import { getGitlabMergeRequest, listGitlabMergeRequests } from "@integration-hub/application/connectors/gitlab/queries.ts";

const ctx = { orgId: DEFAULT_ORG_ID, userId: "user-connectors", projectId: "22222222-2222-4222-8222-222222222222" };

describe("application connectors gitlab", () => {
  test("handles CRUD, not-found, validation, and scoping", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const created = await upsertGitlabMergeRequest(em, ctx, { repoPath: "group/fulcrum", mergeRequestIid: "8", title: "Sync", state: "opened" });
      expect(await listGitlabMergeRequests(em, ctx, { repoPath: "group/fulcrum" })).toHaveLength(1);
      await expect(getGitlabMergeRequest(em, ctx, created.id)).resolves.toMatchObject({ id: created.id, title: "Sync" });
      await expect(getGitlabMergeRequest(em, ctx, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
      await expect(upsertGitlabMergeRequest(em, ctx, { repoPath: "", mergeRequestIid: "", title: "", state: "opened" })).rejects.toBeInstanceOf(AppValidationError);
    } finally {
      await db.close();
    }
  });
});
