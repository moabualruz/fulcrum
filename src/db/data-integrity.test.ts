import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { createTestOrm } from "../test-utils/db.ts";
import { Account } from "./entities/auth/Account.ts";
import { FeatureFlag } from "./entities/auth/FeatureFlag.ts";
import { Org } from "./entities/auth/Org.ts";
import { Verification } from "./entities/auth/Verification.ts";
import { DocTemplate } from "./entities/docs/DocTemplate.ts";
import { RoutingRule, RoutingRuleSource } from "./entities/router/RoutingRule.ts";
import { TEMPLATE_SEEDS } from "../docs/template-seeds.ts";
import { DEFAULT_ORG_ID } from "./seed.ts";
import { Migration20260502100000_doc_templates_seed } from "./migrations/Migration20260502100000_doc_templates_seed.ts";

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
      const em = db.em.fork();
      const now = new Date();
      const org = em.create(Org, {
        name: "Router Cascade",
        slug: "router-cascade",
        createdAt: now,
        updatedAt: now,
      });
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
      em.persist([org, rule]);
      await em.flush();

      em.remove(org);
      await em.flush();

      expect(await em.count(RoutingRule, { org })).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("doc template global names are unique when project is null", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const now = new Date();
      const org = em.create(Org, {
        name: "Docs Global Templates",
        slug: "docs-global-templates",
        createdAt: now,
        updatedAt: now,
      });
      em.persist(org);
      await em.flush();

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

  test("doc template seed migration inserts exactly 9 idempotent org-default rows", async () => {
    const db = await createTestOrm();
    try {
      const seeded = await db.pglite.query<{
        count: string;
        doc_types: string[];
      }>(
        `select count(*)::text as count, array_agg(doc_type order by doc_type) as doc_types
         from "doc_templates"
         where "org_id" = $1 and "project_id" is null and "is_default" = true`,
        [DEFAULT_ORG_ID],
      );

      expect(Number(seeded.rows[0]?.count)).toBe(9);
      expect(seeded.rows[0]?.doc_types).toEqual(
        TEMPLATE_SEEDS.map((seed) => seed.docType).sort(),
      );

      const replay = new Migration20260502100000_doc_templates_seed(
        db.em.getDriver(),
        db.orm.config,
      );
      await replay.up();
      for (const query of replay.getQueries()) {
        await db.em.getDriver().execute(query);
      }

      const afterReplay = await db.pglite.query<{ count: string }>(
        `select count(*)::text as count
         from "doc_templates"
         where "org_id" = $1 and "project_id" is null and "is_default" = true`,
        [DEFAULT_ORG_ID],
      );
      expect(Number(afterReplay.rows[0]?.count)).toBe(9);
    } finally {
      await db.close();
    }
  });

  test("global feature flag rows are unique when org and user are null", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
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
      const accountMeta = metadataFor(db, Account);
      const verificationMeta = metadataFor(db, Verification);

      expect(accountMeta.properties["org"]?.fieldNames).toEqual(["org_id"]);
      expect(accountMeta.properties["org"]?.nullable).toBe(true);
      expect(accountMeta.indexes?.some((idx) => idx.name === "idx_accounts_org_user")).toBe(true);
      expect(verificationMeta.properties["org"]?.fieldNames).toEqual(["org_id"]);
      expect(verificationMeta.properties["org"]?.nullable).toBe(true);
      expect(verificationMeta.indexes?.some((idx) => idx.name === "idx_verifications_org_identifier")).toBe(true);

      const em = db.em.fork();
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
      em.persist([localAccount, localVerification]);
      await em.flush();

      em.clear();
      const savedAccount = await em.findOneOrFail(Account, { accountId: "admin@local" });
      const savedVerification = await em.findOneOrFail(Verification, { value: "local-token" });
      expect(savedAccount.org).toBeNull();
      expect(savedVerification.org).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("accounts reject duplicate provider identities", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
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
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const now = new Date();
      em.persist(em.create(Account, {
        userId: randomUUID(),
        providerId: "github",
        accountId: "orphan-subject",
        createdAt: now,
        updatedAt: now,
      }));
      await expect(em.flush()).rejects.toThrow("accounts_user_id_foreign");

      em.clear();
      const account = em.create(Account, {
        userId: db.seed.userId,
        providerId: "github",
        accountId: "cascade-subject",
        createdAt: now,
        updatedAt: now,
      });
      em.persist(account);
      await em.flush();

      await db.pglite.query(`delete from "users" where "id" = $1`, [db.seed.userId]);
      expect(await em.count(Account, { accountId: "cascade-subject" })).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("account token fields are encrypted at rest and decrypted on entity load", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
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
      em.persist(account);
      await em.flush();
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
