import { describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "../../../db/seed.ts";
import { createTestOrm } from "../../../test-utils/db.ts";
import { AppNotFoundError, AppValidationError } from "../../errors.ts";
import { upsertGithubConnectorState } from "./commands.ts";
import { getGithubConnectorState, listGithubConnectorStates } from "./queries.ts";

const ctx = { orgId: DEFAULT_ORG_ID, userId: "user-connectors", projectId: "22222222-2222-4222-8222-222222222222" };

describe("application connectors github", () => {
  test("handles CRUD, not-found, validation, and scoping", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const created = await upsertGithubConnectorState(em, ctx, { installationId: "9", repoFullName: "mkh/fulcrum", cursor: "c1" });
      expect(await listGithubConnectorStates(em, ctx, { repoFullName: "mkh/fulcrum" })).toHaveLength(1);
      await expect(getGithubConnectorState(em, ctx, created.id)).resolves.toMatchObject({ id: created.id, cursor: "c1" });
      await expect(getGithubConnectorState(em, ctx, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
      await expect(upsertGithubConnectorState(em, ctx, { installationId: "", repoFullName: "" })).rejects.toBeInstanceOf(AppValidationError);
    } finally {
      await db.close();
    }
  });
});
