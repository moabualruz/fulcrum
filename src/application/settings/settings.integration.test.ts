import { describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { createTestOrm } from "../../test-utils/db.ts";
import { AppNotFoundError, AppValidationError } from "../errors.ts";
import { createCredential, setTenantSetting } from "./commands.ts";
import { getCredential, getTenantSetting, listCredentials } from "./queries.ts";

const ctx = { orgId: DEFAULT_ORG_ID, userId: "user-settings", projectId: "22222222-2222-4222-8222-222222222222" };

describe("application settings and credentials", () => {
  test("handles CRUD, not-found, validation, and scoping", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await setTenantSetting(em, ctx, { key: "theme", value: { mode: "dark" } });
      expect(await getTenantSetting(em, ctx, "theme")).toMatchObject({ key: "theme" });
      const credential = await createCredential(em, ctx, { provider: "linear", accountId: "acct", label: "Linear", encryptedSecret: "cipher" });
      expect(await listCredentials(em, ctx, { provider: "linear" })).toHaveLength(1);
      await expect(getCredential(em, ctx, credential.id)).resolves.toMatchObject({ id: credential.id });
      await expect(getCredential(em, ctx, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
      await expect(createCredential(em, ctx, { provider: "", accountId: "", label: "", encryptedSecret: "" })).rejects.toBeInstanceOf(AppValidationError);
    } finally {
      await db.close();
    }
  });
});
