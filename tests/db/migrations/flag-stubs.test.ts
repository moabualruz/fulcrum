/**
 * TDD — flag-stub entity tests (CasbinRule, WebhookSubscription, NotificationRule).
 *
 * Each entity is consumed by a later pillar gated behind a feature flag:
 *   - CasbinRule          → Pillar 5 (Permissions) via `casbin-policies` flag
 *   - WebhookSubscription → Pillar 10 (Webhooks) via `outbound-webhooks` flag
 *   - NotificationRule    → Pillar 12 (Notify) via `notify-email`/`notify-webhook`/`notify-slack`
 *
 * Stub entities live here so the schema migration is split into a single
 * stable baseline (P1#03) — later pillars never need to add the base table.
 *
 * Closes (issue): .scratch/agent-os-vision/01-foundation-reset/issues/03-composite-indexes-and-flag-stub-tables.md
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { MikroORM, ReferenceKind } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "../../../src/db/PGliteKyselyDriver.ts";

import { Org } from "../../../src/db/entities/auth/Org.ts";
import { User } from "../../../src/db/entities/auth/User.ts";
import { Session } from "../../../src/db/entities/auth/Session.ts";
import { Invitation } from "../../../src/db/entities/auth/Invitation.ts";
import { OrgMember } from "../../../src/db/entities/auth/OrgMember.ts";
import { FeatureFlag } from "../../../src/db/entities/auth/FeatureFlag.ts";
import { Event } from "../../../src/db/entities/core/Event.ts";

// Stub tenant-scoped entities (registered for completeness — schema needs them all)
import { Task } from "../../../src/db/entities/tasks/Task.ts";
import { Document } from "../../../src/db/entities/docs/Document.ts";
import { Memory } from "../../../src/db/entities/memory/Memory.ts";
import { AgentRun } from "../../../src/db/entities/orchestration/AgentRun.ts";
import { Artifact } from "../../../src/db/entities/artifacts/Artifact.ts";
import { Repo } from "../../../src/db/entities/repos/Repo.ts";
import { Job } from "../../../src/db/entities/jobs/Job.ts";
import { SearchDocument } from "../../../src/db/entities/search/SearchDocument.ts";

// Flag-stub entities under test
import { CasbinRule } from "../../../src/db/entities/flags/CasbinRule.ts";
import { WebhookSubscription } from "../../../src/db/entities/flags/WebhookSubscription.ts";
import { NotificationRule } from "../../../src/db/entities/flags/NotificationRule.ts";

import { CasbinRuleRepository } from "../../../src/db/repositories/flags/CasbinRuleRepository.ts";
import { WebhookSubscriptionRepository } from "../../../src/db/repositories/flags/WebhookSubscriptionRepository.ts";
import { NotificationRuleRepository } from "../../../src/db/repositories/flags/NotificationRuleRepository.ts";

let orm: MikroORM;

beforeAll(async () => {
  const pglite = new PGlite();
  const dialect = new PGliteKyselyDialect(() => pglite);

  orm = await MikroORM.init({
    dbName: "postgres",
    driverOptions: dialect,
    entities: [
      Org,
      User,
      Session,
      Invitation,
      OrgMember,
      FeatureFlag,
      Event,
      Task,
      Document,
      Memory,
      AgentRun,
      Artifact,
      Repo,
      Job,
      SearchDocument,
      CasbinRule,
      WebhookSubscription,
      NotificationRule,
    ],
    debug: false,
  });

  await orm.schema.create();
});

afterAll(async () => {
  if (orm) await orm.close(true);
});

// ──────────────────────────────────────────────
// CasbinRule — node-casbin adapter target
// ──────────────────────────────────────────────

describe("CasbinRule entity metadata", () => {
  it("registered with tableName=casbin_rule (node-casbin convention)", () => {
    const meta = orm.getMetadata().get(CasbinRule);
    expect(meta).toBeDefined();
    expect(meta.tableName).toBe("casbin_rule");
  });

  it("has the 8 columns required by node-casbin contract", () => {
    const meta = orm.getMetadata().get(CasbinRule);
    const props = meta.properties as Record<string, unknown>;
    // node-casbin requires: id, ptype, v0..v5
    const expected = ["id", "ptype", "v0", "v1", "v2", "v3", "v4", "v5"];
    for (const name of expected) {
      expect(props[name]).toBeDefined();
    }
    // Property count: exactly the 8 expected columns.
    expect(Object.keys(props).length).toBe(8);
  });

  it("count() === 0 on fresh schema", async () => {
    const em = orm.em.fork();
    const repo = em.getRepository(CasbinRule) as CasbinRuleRepository;
    const count = await repo.count();
    expect(count).toBe(0);
  });
});

// ──────────────────────────────────────────────
// WebhookSubscription — outbound webhooks
// ──────────────────────────────────────────────

describe("WebhookSubscription entity metadata", () => {
  it("registered with tableName=webhook_subscriptions", () => {
    const meta = orm.getMetadata().get(WebhookSubscription);
    expect(meta).toBeDefined();
    expect(meta.tableName).toBe("webhook_subscriptions");
  });

  it("has C10-minimum columns: id + org ManyToOne + active (index axes only)", () => {
    // C10 stub ceiling: id + org FK + columns-in-composite-index.
    // Index: (org, active). Domain fields (url, events, secret, created_at)
    // deferred to Pillar 10 own-migration. Trimmed per P1#03 follow-up.
    const meta = orm.getMetadata().get(WebhookSubscription);
    expect(meta.properties["id"]).toBeDefined();
    expect(meta.properties["org"]).toBeDefined();
    expect(meta.properties["org"]!.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(meta.properties["active"]).toBeDefined();
    // Ensure trimmed columns are NOT present at this stub stage.
    // Cast to Record to allow indexing by removed property names (TS7053 guard).
    const props = meta.properties as Record<string, unknown>;
    expect(props["url"]).toBeUndefined();
    expect(props["events"]).toBeUndefined();
    expect(props["secret"]).toBeUndefined();
  });

  it("count() === 0 on fresh schema", async () => {
    const em = orm.em.fork();
    const repo = em.getRepository(WebhookSubscription) as WebhookSubscriptionRepository;
    const count = await repo.count();
    expect(count).toBe(0);
  });
});

// ──────────────────────────────────────────────
// NotificationRule — outbound notifications
// ──────────────────────────────────────────────

describe("NotificationRule entity metadata", () => {
  it("registered with tableName=notification_rules", () => {
    const meta = orm.getMetadata().get(NotificationRule);
    expect(meta).toBeDefined();
    expect(meta.tableName).toBe("notification_rules");
  });

  it("has C10-minimum columns: id + org ManyToOne + subjectKind + active (index axes only)", () => {
    // C10 stub ceiling: id + org FK + columns-in-composite-index.
    // Index: (org, active, subjectKind). Domain fields (verb, channel, target,
    // created_at) deferred to Pillar 12 own-migration. Trimmed per P1#03 follow-up.
    const meta = orm.getMetadata().get(NotificationRule);
    expect(meta.properties["id"]).toBeDefined();
    expect(meta.properties["org"]).toBeDefined();
    expect(meta.properties["org"]!.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(meta.properties["subjectKind"]).toBeDefined();
    expect(meta.properties["active"]).toBeDefined();
    // Ensure trimmed columns are NOT present at this stub stage.
    // Cast to Record to allow indexing by removed property names (TS7053 guard).
    const props = meta.properties as Record<string, unknown>;
    expect(props["verb"]).toBeUndefined();
    expect(props["channel"]).toBeUndefined();
    expect(props["target"]).toBeUndefined();
  });

  it("count() === 0 on fresh schema", async () => {
    const em = orm.em.fork();
    const repo = em.getRepository(NotificationRule) as NotificationRuleRepository;
    const count = await repo.count();
    expect(count).toBe(0);
  });
});

// ──────────────────────────────────────────────
// Repository class definitions
// ──────────────────────────────────────────────

describe("Flag-stub repository class definitions", () => {
  it("CasbinRuleRepository class is defined", () => {
    expect(CasbinRuleRepository).toBeDefined();
    expect(typeof CasbinRuleRepository).toBe("function");
  });

  it("WebhookSubscriptionRepository class is defined", () => {
    expect(WebhookSubscriptionRepository).toBeDefined();
    expect(typeof WebhookSubscriptionRepository).toBe("function");
  });

  it("NotificationRuleRepository class is defined", () => {
    expect(NotificationRuleRepository).toBeDefined();
    expect(typeof NotificationRuleRepository).toBe("function");
  });

  it("em.getRepository(CasbinRule) is CasbinRuleRepository", () => {
    const repo = orm.em.getRepository(CasbinRule);
    expect(repo).toBeInstanceOf(CasbinRuleRepository);
  });

  it("em.getRepository(WebhookSubscription) is WebhookSubscriptionRepository", () => {
    const repo = orm.em.getRepository(WebhookSubscription);
    expect(repo).toBeInstanceOf(WebhookSubscriptionRepository);
  });

  it("em.getRepository(NotificationRule) is NotificationRuleRepository", () => {
    const repo = orm.em.getRepository(NotificationRule);
    expect(repo).toBeInstanceOf(NotificationRuleRepository);
  });
});
