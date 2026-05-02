import { describe, expect, test } from "bun:test";

import { createTestOrm } from "../test-utils/db.ts";
import { Account } from "./entities/auth/Account.ts";
import { FeatureFlag } from "./entities/auth/FeatureFlag.ts";
import { Org } from "./entities/auth/Org.ts";
import { Verification } from "./entities/auth/Verification.ts";
import { DocTemplate } from "./entities/docs/DocTemplate.ts";
import { RoutingRule, RoutingRuleSource } from "./entities/router/RoutingRule.ts";

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
});
