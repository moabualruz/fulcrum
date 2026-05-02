/**
 * TDD — Pillar 17 cross-cutting-platform migration class
 * (Credential, TelemetryEvent, ErrorLog, ExperimentAssignment, FeatureFlagRollout).
 *
 * Asserts:
 *   1. All 5 entity mappings registered with correct table names + primary key.
 *   2. ManyToOne org FK is NON-NULLABLE on every entity (Q22 — composite-index axis).
 *   3. UNIQUE constraints land per spec:
 *        Credential          UNIQUE(org, user, name)
 *        ExperimentAssignment UNIQUE(org, user, experimentId)
 *        FeatureFlagRollout  UNIQUE(org, flag)
 *   4. Composite indexes land per spec (DESC on time-keyed columns via expression form):
 *        credentials              (org, user, last_used_at DESC) + (org, archived)
 *        telemetry_events         (org, occurred_at DESC) + (org, user, kind)
 *        error_logs               (org, occurred_at DESC)
 *        experiment_assignment    (org, experiment_id)
 *   5. FeatureFlagRollout has ManyToOne relation to Pillar 1 FeatureFlag entity.
 *   6. Repositories wired via @Entity({ repository }) — em.getRepository() returns
 *      the typed subclass instance.
 *   7. Migration idempotent — applying then re-applying via Migrator is a no-op.
 *
 * C2: org_id NOT NULL + composite indexes mandatory per Q22.
 * C6: NO raw SQL outside src/db/migrations/ Migration class bodies.
 * C7: MikroORM v7 ES Stage-3 decorator pattern.
 *
 * Closes (issue): .scratch/agent-os-vision/17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { MikroORM, ReferenceKind } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "../../../src/db/PGliteKyselyDriver.ts";

// Pillar 1 + supporting entities (FK targets)
import { SchemaMigration } from "../../../src/db/entities/SchemaMigration.ts";
import { Org } from "../../../src/db/entities/auth/Org.ts";
import { User } from "../../../src/db/entities/auth/User.ts";
import { Session } from "../../../src/db/entities/auth/Session.ts";
import { Account } from "../../../src/db/entities/auth/Account.ts";
import { Verification } from "../../../src/db/entities/auth/Verification.ts";
import { Invitation } from "../../../src/db/entities/auth/Invitation.ts";
import { OrgMember } from "../../../src/db/entities/auth/OrgMember.ts";
import { FeatureFlag } from "../../../src/db/entities/auth/FeatureFlag.ts";
import { Event } from "../../../src/db/entities/core/Event.ts";

// Stub tenant-scoped entities (registered so schema graph is complete)
import { Task } from "../../../src/db/entities/tasks/Task.ts";
import { Document } from "../../../src/db/entities/docs/Document.ts";
import { Memory } from "../../../src/db/entities/memory/Memory.ts";
import { AgentRun } from "../../../src/db/entities/orchestration/AgentRun.ts";
import { Artifact } from "../../../src/db/entities/artifacts/Artifact.ts";
import { Repo } from "../../../src/db/entities/repos/Repo.ts";
import { Job } from "../../../src/db/entities/jobs/Job.ts";
import { SearchDocument } from "../../../src/db/entities/search/SearchDocument.ts";
import { CasbinRule } from "../../../src/db/entities/flags/CasbinRule.ts";
import { WebhookSubscription } from "../../../src/db/entities/flags/WebhookSubscription.ts";
import { NotificationRule } from "../../../src/db/entities/flags/NotificationRule.ts";

// Pillar 17 entities under test
import { Credential } from "../../../src/db/entities/platform/Credential.ts";
import { TelemetryEvent } from "../../../src/db/entities/platform/TelemetryEvent.ts";
import { ErrorLog } from "../../../src/db/entities/platform/ErrorLog.ts";
import { ExperimentAssignment } from "../../../src/db/entities/platform/ExperimentAssignment.ts";
import { FeatureFlagRollout } from "../../../src/db/entities/platform/FeatureFlagRollout.ts";

import { CredentialRepository } from "../../../src/db/repositories/platform/CredentialRepository.ts";
import { TelemetryEventRepository } from "../../../src/db/repositories/platform/TelemetryEventRepository.ts";
import { ErrorLogRepository } from "../../../src/db/repositories/platform/ErrorLogRepository.ts";
import { ExperimentAssignmentRepository } from "../../../src/db/repositories/platform/ExperimentAssignmentRepository.ts";
import { FeatureFlagRolloutRepository } from "../../../src/db/repositories/platform/FeatureFlagRolloutRepository.ts";

const ALL_ENTITIES = [
  SchemaMigration,
  Org,
  User,
  Session,
  Account,
  Verification,
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
  Credential,
  TelemetryEvent,
  ErrorLog,
  ExperimentAssignment,
  FeatureFlagRollout,
];

let orm: MikroORM;
let pglite: PGlite;

beforeAll(async () => {
  pglite = new PGlite();
  const dialect = new PGliteKyselyDialect(() => pglite);

  orm = await MikroORM.init({
    dbName: "postgres",
    driverOptions: dialect,
    multipleStatements: false,
    entities: ALL_ENTITIES,
    debug: false,
  });

  await orm.schema.create();
});

afterAll(async () => {
  if (orm) await orm.close(true);
  await (pglite as { close?: () => Promise<void> }).close?.();
});

// ──────────────────────────────────────────────
// Credential
// ──────────────────────────────────────────────

describe("Credential entity metadata", () => {
  it("registered with tableName=credentials", () => {
    const meta = orm.getMetadata().get(Credential);
    expect(meta).toBeDefined();
    expect(meta.tableName).toBe("credentials");
  });

  it("has UUID primary key + non-null org + non-null user ManyToOne", () => {
    const meta = orm.getMetadata().get(Credential);
    expect(meta.properties["id"]!.primary).toBe(true);
    expect(meta.properties["id"]!.type).toMatch(/uuid/i);

    const org = meta.properties["org"];
    expect(org).toBeDefined();
    expect(org!.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(org!.nullable).not.toBe(true);

    const user = meta.properties["user"];
    expect(user).toBeDefined();
    expect(user!.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(user!.nullable).not.toBe(true);
  });

  it("has UNIQUE constraint (org, user, name)", () => {
    const meta = orm.getMetadata().get(Credential);
    const uq = meta.uniques?.find((u) => u.name === "uq_credentials_org_user_name");
    expect(uq).toBeDefined();
    const props = Array.isArray(uq!.properties) ? uq!.properties : [uq!.properties];
    expect(props).toEqual(["org", "user", "name"]);
  });

  it("has composite index (org, user, lastUsedAt DESC) + (org, archived)", () => {
    const meta = orm.getMetadata().get(Credential);
    const lastUsed = meta.indexes?.find(
      (i) => i.name === "idx_credentials_org_user_last_used",
    );
    expect(lastUsed).toBeDefined();
    expect(lastUsed!.expression).toMatch(/last_used_at.*desc/i);

    const archived = meta.indexes?.find(
      (i) => i.name === "idx_credentials_org_archived",
    );
    expect(archived).toBeDefined();
    const archivedProps = Array.isArray(archived!.properties)
      ? archived!.properties
      : [archived!.properties];
    expect(archivedProps).toEqual(["org", "archived"]);
  });

  it("em.getRepository(Credential) is CredentialRepository", () => {
    const repo = orm.em.getRepository(Credential);
    expect(repo).toBeInstanceOf(CredentialRepository);
  });
});

// ──────────────────────────────────────────────
// TelemetryEvent
// ──────────────────────────────────────────────

describe("TelemetryEvent entity metadata", () => {
  it("registered with tableName=telemetry_events", () => {
    const meta = orm.getMetadata().get(TelemetryEvent);
    expect(meta.tableName).toBe("telemetry_events");
  });

  it("org NOT NULL; user nullable; kind + payload + occurredAt present", () => {
    const meta = orm.getMetadata().get(TelemetryEvent);
    expect(meta.properties["org"]!.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(meta.properties["org"]!.nullable).not.toBe(true);
    expect(meta.properties["user"]!.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(meta.properties["user"]!.nullable).toBe(true);
    expect(meta.properties["kind"]).toBeDefined();
    expect(meta.properties["payload"]).toBeDefined();
    expect(meta.properties["occurredAt"]).toBeDefined();
  });

  it("has composite index (org, occurredAt DESC) + (org, user, kind)", () => {
    const meta = orm.getMetadata().get(TelemetryEvent);

    const time = meta.indexes?.find(
      (i) => i.name === "idx_telemetry_events_org_occurred",
    );
    expect(time).toBeDefined();
    expect(time!.expression).toMatch(/occurred_at.*desc/i);

    const userKind = meta.indexes?.find(
      (i) => i.name === "idx_telemetry_events_org_user_kind",
    );
    expect(userKind).toBeDefined();
    const props = Array.isArray(userKind!.properties)
      ? userKind!.properties
      : [userKind!.properties];
    expect(props).toEqual(["org", "user", "kind"]);
  });

  it("em.getRepository(TelemetryEvent) is TelemetryEventRepository", () => {
    expect(orm.em.getRepository(TelemetryEvent)).toBeInstanceOf(
      TelemetryEventRepository,
    );
  });
});

// ──────────────────────────────────────────────
// ErrorLog
// ──────────────────────────────────────────────

describe("ErrorLog entity metadata", () => {
  it("registered with tableName=error_logs", () => {
    const meta = orm.getMetadata().get(ErrorLog);
    expect(meta.tableName).toBe("error_logs");
  });

  it("org NOT NULL; user nullable; required errorMessage + occurredAt", () => {
    const meta = orm.getMetadata().get(ErrorLog);
    expect(meta.properties["org"]!.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(meta.properties["org"]!.nullable).not.toBe(true);
    expect(meta.properties["user"]!.nullable).toBe(true);
    expect(meta.properties["errorMessage"]).toBeDefined();
    expect(meta.properties["errorMessage"]!.nullable).not.toBe(true);
    expect(meta.properties["occurredAt"]).toBeDefined();
  });

  it("maps long error fields to text columns", () => {
    const meta = orm.getMetadata().get(ErrorLog);
    expect(meta.properties["recentCliCommand"]!.type).toBe("text");
    expect(meta.properties["errorMessage"]!.type).toBe("text");
    expect(meta.properties["stackTrace"]!.type).toBe("text");
  });

  it("has composite index (org, occurredAt DESC)", () => {
    const meta = orm.getMetadata().get(ErrorLog);
    const idx = meta.indexes?.find((i) => i.name === "idx_error_logs_org_occurred");
    expect(idx).toBeDefined();
    expect(idx!.expression).toMatch(/occurred_at.*desc/i);
  });

  it("em.getRepository(ErrorLog) is ErrorLogRepository", () => {
    expect(orm.em.getRepository(ErrorLog)).toBeInstanceOf(ErrorLogRepository);
  });
});

// ──────────────────────────────────────────────
// ExperimentAssignment
// ──────────────────────────────────────────────

describe("ExperimentAssignment entity metadata", () => {
  it("registered with tableName=experiment_assignment", () => {
    const meta = orm.getMetadata().get(ExperimentAssignment);
    expect(meta.tableName).toBe("experiment_assignment");
  });

  it("non-null org + user; required experimentId + variant + assignedAt", () => {
    const meta = orm.getMetadata().get(ExperimentAssignment);
    expect(meta.properties["org"]!.nullable).not.toBe(true);
    expect(meta.properties["user"]!.nullable).not.toBe(true);
    expect(meta.properties["experimentId"]).toBeDefined();
    expect(meta.properties["variant"]).toBeDefined();
    expect(meta.properties["assignedAt"]).toBeDefined();
  });

  it("UNIQUE(org, user, experimentId) + index (org, experimentId)", () => {
    const meta = orm.getMetadata().get(ExperimentAssignment);

    const uq = meta.uniques?.find(
      (u) => u.name === "uq_experiment_assignment_org_user_experiment",
    );
    expect(uq).toBeDefined();
    const uqProps = Array.isArray(uq!.properties) ? uq!.properties : [uq!.properties];
    expect(uqProps).toEqual(["org", "user", "experimentId"]);

    const idx = meta.indexes?.find(
      (i) => i.name === "idx_experiment_assignment_org_experiment",
    );
    expect(idx).toBeDefined();
    const idxProps = Array.isArray(idx!.properties)
      ? idx!.properties
      : [idx!.properties];
    expect(idxProps).toEqual(["org", "experimentId"]);
  });

  it("em.getRepository(ExperimentAssignment) is ExperimentAssignmentRepository", () => {
    expect(orm.em.getRepository(ExperimentAssignment)).toBeInstanceOf(
      ExperimentAssignmentRepository,
    );
  });
});

// ──────────────────────────────────────────────
// FeatureFlagRollout
// ──────────────────────────────────────────────

describe("FeatureFlagRollout entity metadata", () => {
  it("registered with tableName=feature_flag_rollouts", () => {
    const meta = orm.getMetadata().get(FeatureFlagRollout);
    expect(meta.tableName).toBe("feature_flag_rollouts");
  });

  it("non-null org + flag ManyToOne; rolloutPercent + cohortRules + updatedBy + updatedAt", () => {
    const meta = orm.getMetadata().get(FeatureFlagRollout);

    expect(meta.properties["org"]!.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(meta.properties["org"]!.nullable).not.toBe(true);

    const flag = meta.properties["flag"];
    expect(flag).toBeDefined();
    expect(flag!.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(flag!.nullable).not.toBe(true);
    // FeatureFlagRollout points at Pillar 1 FeatureFlag entity (not a copy).
    expect(flag!.entity() as unknown).toBe(FeatureFlag);

    expect(meta.properties["rolloutPercent"]).toBeDefined();
    expect(meta.properties["cohortRules"]).toBeDefined();
    expect(meta.properties["updatedBy"]!.nullable).toBe(true);
    expect(meta.properties["updatedAt"]).toBeDefined();
  });

  it("enforces rolloutPercent 0..100 via check metadata", () => {
    const meta = orm.getMetadata().get(FeatureFlagRollout);
    const checkText = JSON.stringify([
      ...(meta.checks ?? []),
      meta.properties["rolloutPercent"],
    ]);
    expect(checkText).toContain("feature_flag_rollouts_rollout_percent_check");
    expect(checkText).toContain("rollout_percent");
  });

  it("UNIQUE(org, flag)", () => {
    const meta = orm.getMetadata().get(FeatureFlagRollout);
    const uq = meta.uniques?.find(
      (u) => u.name === "uq_feature_flag_rollouts_org_flag",
    );
    expect(uq).toBeDefined();
    const props = Array.isArray(uq!.properties) ? uq!.properties : [uq!.properties];
    expect(props).toEqual(["org", "flag"]);
  });

  it("em.getRepository(FeatureFlagRollout) is FeatureFlagRolloutRepository", () => {
    expect(orm.em.getRepository(FeatureFlagRollout)).toBeInstanceOf(
      FeatureFlagRolloutRepository,
    );
  });
});

// ──────────────────────────────────────────────
// Repository smoke checks: count() on every entity
// ──────────────────────────────────────────────

describe("Pillar 17 repositories — count() === 0 on fresh schema", () => {
  it("CredentialRepository.count() === 0", async () => {
    const repo = orm.em.fork().getRepository(Credential);
    expect(await repo.count()).toBe(0);
  });

  it("TelemetryEventRepository.count() === 0", async () => {
    const repo = orm.em.fork().getRepository(TelemetryEvent);
    expect(await repo.count()).toBe(0);
  });

  it("ErrorLogRepository.count() === 0", async () => {
    const repo = orm.em.fork().getRepository(ErrorLog);
    expect(await repo.count()).toBe(0);
  });

  it("ExperimentAssignmentRepository.count() === 0", async () => {
    const repo = orm.em.fork().getRepository(ExperimentAssignment);
    expect(await repo.count()).toBe(0);
  });

  it("FeatureFlagRolloutRepository.count() === 0", async () => {
    const repo = orm.em.fork().getRepository(FeatureFlagRollout);
    expect(await repo.count()).toBe(0);
  });
});

// ──────────────────────────────────────────────
// Migration class — applies once and is idempotent on re-run
// ──────────────────────────────────────────────

describe("Pillar 17 migration class — applies + idempotent", () => {
  it("Migrator.up() applies the cross-cutting-platform migration", async () => {
    const migrationPglite = new PGlite();
    const dialect = new PGliteKyselyDialect(() => migrationPglite);
    const migrationOrm = await MikroORM.init({
      dbName: "postgres",
      driverOptions: dialect,
      multipleStatements: false,
      entities: ALL_ENTITIES,
      migrations: {
        path: new URL("../../../src/db/migrations", import.meta.url).pathname,
        pathTs: new URL("../../../src/db/migrations", import.meta.url).pathname,
        transactional: false,
        allOrNothing: false,
      },
      extensions: [Migrator],
      debug: false,
    });

    try {
      const migrator = migrationOrm.migrator;
      const applied = await migrator.up();
      const ours = applied.find((m) =>
        m.name.includes("cross_cutting_platform"),
      );
      expect(ours).toBeDefined();

      const em = migrationOrm.em.fork();
      const org = em.create(Org, {
        name: "Range Test",
        slug: "range-test",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const flag = em.create(FeatureFlag, {
        flag: "range-test",
        enabled: true,
        createdAt: new Date(),
      });
      em.persist([org, flag]);
      await em.flush();

      let caught: unknown;
      try {
        em.create(FeatureFlagRollout, {
          org,
          flag,
          rolloutPercent: 101,
          cohortRules: {},
          updatedAt: new Date(),
        });
        await em.flush();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeDefined();
      expect(String((caught as { message?: unknown }).message ?? caught)).toContain(
        "feature_flag_rollouts_rollout_percent_check",
      );

      // Idempotent re-run: pending() must be empty after up().
      const pending = await migrator.getPending();
      expect(pending.length).toBe(0);

      // Run up() again — must not error and must report no new applied.
      const second = await migrator.up();
      expect(second.length).toBe(0);
    } finally {
      await migrationOrm.close(true);
      await (migrationPglite as { close?: () => Promise<void> }).close?.();
    }
  });
});
