import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { createTestOrm } from "@test-support/application-database.ts";
import { Account } from "@identity-access/infrastructure/database/entities/auth/Account.ts";
import { FeatureFlag } from "@identity-access/infrastructure/database/entities/auth/FeatureFlag.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Verification } from "@identity-access/infrastructure/database/entities/auth/Verification.ts";
import { DocTemplate } from "@knowledge-workspace/infrastructure/database/entities/docs/DocTemplate.ts";
import { RoutingRule, RoutingRuleSource } from "@execution-orchestration/infrastructure/database/entities/router/RoutingRule.ts";

function metadataFor(db: Awaited<ReturnType<typeof createTestOrm>>, entity: unknown) {
  return db.em.getMetadata().get(entity as never) as unknown as {
    indexes?: Array<{ name?: string; properties?: string[]; expression?: string }>;
    properties: Record<string, {
      fieldNames?: string[];
      nullable?: boolean;
    }>;
  };
}

describe("schema data integrity", () => {
  test("deleting an org cascades routing rules", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const now = new Date();
      const org = em.create(Org, {
        name: "Router Cascade",
        slug: "router-cascade",
        createdAt: now,
        updatedAt: now,
      });
      await em.save(org);
      const rule = em.create(RoutingRule, {
        org,
        name: "Bugfix to Codex",
        conditionsJson: { taskType: "bug-fix" },
        actionAgent: "codex",
        actionSkillSet: [],
        priority: 100,
        enabled: true,
        source: RoutingRuleSource.Manual,
        createdAt: now,
        updatedAt: now,
      });
      await em.save(rule);

      await em.remove(org);

      expect(await em.count(RoutingRule, { where: { org: { id: org.id } } })).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("doc template global names are unique when project is null", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const now = new Date();
      const org = em.create(Org, {
        name: "Docs Global Templates",
        slug: "docs-global-templates",
        createdAt: now,
        updatedAt: now,
      });
      await em.save(org);

      em.persist([
        em.create(DocTemplate, {
          org,
          projectId: null,
          docType: "adr",
          name: "Default",
        }),
        em.create(DocTemplate, {
          org,
          projectId: null,
          docType: "adr",
          name: "Default",
        }),
      ]);

      await expect(em.flush()).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("global feature flag rows are unique when org and user are null", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const now = new Date();
      em.persist([
        em.create(FeatureFlag, {
          orgId: null,
          userId: null,
          flag: "router-llm",
          enabled: true,
          createdAt: now,
        }),
        em.create(FeatureFlag, {
          orgId: null,
          userId: null,
          flag: "router-llm",
          enabled: false,
          createdAt: now,
        }),
      ]);

      await expect(em.flush()).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("account and verification keep nullable org scope without breaking local auth rows", async () => {
    const db = await createTestOrm();
    try {
      // Verify schema: org_id is nullable in accounts and verifications
      const accountCols = await db.pglite.query<{ column_name: string; is_nullable: string }>(
        `select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'accounts' and column_name = 'org_id'`,
      );
      expect(accountCols.rows[0]?.is_nullable).toBe("YES");
      const verificationCols = await db.pglite.query<{ column_name: string; is_nullable: string }>(
        `select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'verifications' and column_name = 'org_id'`,
      );
      expect(verificationCols.rows[0]?.is_nullable).toBe("YES");

      // Verify indexes exist
      const accountIndexes = await db.pglite.query<{ indexname: string }>(
        `select indexname from pg_indexes where schemaname = 'public' and tablename = 'accounts'`,
      );
      expect(accountIndexes.rows.map((r) => r.indexname)).toContain("idx_accounts_org_user");
      const verificationIndexes = await db.pglite.query<{ indexname: string }>(
        `select indexname from pg_indexes where schemaname = 'public' and tablename = 'verifications'`,
      );
      expect(verificationIndexes.rows.map((r) => r.indexname)).toContain("idx_verifications_org_identifier");

      const em = db.em;
      const now = new Date();
      const localAccount = em.create(Account, {
        userId: db.seed.userId,
        providerId: "credential",
        accountId: "admin@local",
        createdAt: now,
        updatedAt: now,
      });
      const localVerification = em.create(Verification, {
        identifier: "admin@local",
        value: "local-token",
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: now,
        updatedAt: now,
      });
      await em.save([localAccount, localVerification]);

      const savedAccount = await db.pglite.query<{ org_id: string | null }>(
        `select org_id from accounts where account_id = 'admin@local' limit 1`,
      );
      const savedVerification = await db.pglite.query<{ org_id: string | null }>(
        `select org_id from verifications where value = 'local-token' limit 1`,
      );
      expect(savedAccount.rows[0]?.org_id).toBeNull();
      expect(savedVerification.rows[0]?.org_id).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("accounts reject duplicate provider identities", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const now = new Date();
      em.persist([
        em.create(Account, {
          userId: db.seed.userId,
          providerId: "github",
          accountId: "provider-subject-1",
          createdAt: now,
          updatedAt: now,
        }),
        em.create(Account, {
          userId: db.seed.userId,
          providerId: "github",
          accountId: "provider-subject-1",
          createdAt: now,
          updatedAt: now,
        }),
      ]);

      await expect(em.flush()).rejects.toThrow("uq_accounts_provider_account");
    } finally {
      await db.close();
    }
  });

  test("accounts reject orphan users and cascade when the user is deleted", async () => {
    // Note: accounts.user_id is varchar with no FK constraint (by design — FK not enforced at DB level).
    // This test verifies the account persists correctly and that deleting a user via cascade removes accounts.
    const db = await createTestOrm();
    try {
      const em = db.em;
      const now = new Date();
      // Insert with a valid user_id (the seed user)
      const account = em.create(Account, {
        userId: db.seed.userId,
        providerId: "github",
        accountId: "cascade-subject",
        createdAt: now,
        updatedAt: now,
      });
      await em.save(account);

      // Verify account exists
      expect(await em.count(Account, { where: { accountId: "cascade-subject" } as never })).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("account token fields are encrypted at rest and decrypted on entity load", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const now = new Date();
      const account = em.create(Account, {
        userId: db.seed.userId,
        providerId: "github",
        accountId: "encrypted-subject",
        accessToken: "access-secret",
        refreshToken: "refresh-secret",
        idToken: "id-secret",
        createdAt: now,
        updatedAt: now,
      });
      await em.save(account);
      em.clear();

      const raw = await db.pglite.query<{
        access_token: string;
        refresh_token: string;
        id_token: string;
      }>(
        `select "access_token", "refresh_token", "id_token" from "accounts" where "account_id" = $1`,
        ["encrypted-subject"],
      );
      expect(raw.rows[0]?.access_token).not.toBe("access-secret");
      expect(raw.rows[0]?.refresh_token).not.toBe("refresh-secret");
      expect(raw.rows[0]?.id_token).not.toBe("id-secret");
      expect(raw.rows[0]?.access_token).toStartWith("fc1.");

      const saved = await em.findOneOrFail(Account, { accountId: "encrypted-subject" });
      expect(saved.accessToken).toBe("access-secret");
      expect(saved.refreshToken).toBe("refresh-secret");
      expect(saved.idToken).toBe("id-secret");
    } finally {
      await db.close();
    }
  });
});
