/**
 * MikroORM v7 configuration — single source of truth.
 *
 * Driver selection:
 *   - LOCAL (default): PGlite via a custom Kysely dialect adapter.
 *   - SAAS: @mikro-orm/postgresql (standard pg Pool) when DATABASE_URL points to a server.
 *
 * C6: No plaintext SQL in this file.
 * C7: MikroORM v7 + @Entity decorator-class entities.
 * C9: Config lives here; entities registered per domain.
 */

import type { MikroORM, Options } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import type { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "./PGliteKyselyDriver.ts";

// Entity classes — imported here so all consumers get a consistent list.
// Uses @Entity decorator classes (C7: ES Stage-3 decorators).
import { SchemaMigration } from "./entities/SchemaMigration.ts";
import { Org } from "./entities/auth/Org.ts";
import { User } from "./entities/auth/User.ts";
import { Session } from "./entities/auth/Session.ts";
import { Account } from "./entities/auth/Account.ts";
import { Verification } from "./entities/auth/Verification.ts";
import { Invitation } from "./entities/auth/Invitation.ts";
import { OrgMember } from "./entities/auth/OrgMember.ts";
import { FeatureFlag } from "./entities/auth/FeatureFlag.ts";
import { Event } from "./entities/core/Event.ts";

// Tenant-scoped stub entities (P1#03 — composite index decorators land here so
// later pillars never need a base-table migration).
import { Task } from "./entities/tasks/Task.ts";
import { TaskStatus } from "./entities/tasks/TaskStatus.ts";
import { Sprint } from "./entities/tasks/Sprint.ts";
import { SavedView } from "./entities/tasks/SavedView.ts";
import { Document } from "./entities/docs/Document.ts";
import { DocLink } from "./entities/docs/DocLink.ts";
import { DocVersion } from "./entities/docs/DocVersion.ts";
import { DocComment } from "./entities/docs/DocComment.ts";
import { DocTemplate } from "./entities/docs/DocTemplate.ts";
import { ContextSnapshot, Memory, MemoryLink } from "./entities/memory/index.ts";
import { AgentRun } from "./entities/orchestration/AgentRun.ts";
import { WorkflowDefinition } from "./entities/orchestration/WorkflowDefinition.ts";
import { RoutingRule } from "./entities/router/RoutingRule.ts";
import { Artifact, Edge } from "./entities/sandbox/index.ts";
import { Repo, RepoBranch, RepoCommit, RepoFilesIndex } from "./entities/repos/index.ts";
import { Job } from "./entities/jobs/Job.ts";
import { SearchDocument } from "./entities/search/SearchDocument.ts";
import { ModelCache } from "./entities/inference/ModelCache.ts";
import { ProviderCredential } from "./entities/inference/ProviderCredential.ts";

// Flag-stub entities (P1#03 — gated behind feature flags by later pillars).
import { CasbinRule } from "./entities/flags/CasbinRule.ts";
import { WebhookSubscription } from "./entities/flags/WebhookSubscription.ts";
import { NotificationRule } from "./entities/flags/NotificationRule.ts";

// Platform / cross-cutting entities (P17#01 — Pillar 17 always-on).
import { Credential } from "./entities/platform/Credential.ts";
import { TelemetryEvent } from "./entities/platform/TelemetryEvent.ts";
import { ErrorLog } from "./entities/platform/ErrorLog.ts";
import { ExperimentAssignment } from "./entities/platform/ExperimentAssignment.ts";
import { FeatureFlagRollout } from "./entities/platform/FeatureFlagRollout.ts";

// Skills registry entities (P5#02).
import { FulcrumSkill } from "./entities/skills/FulcrumSkill.ts";
import { SkillVersion } from "./entities/skills/SkillVersion.ts";

export {
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
  TaskStatus,
  Sprint,
  SavedView,
  Document,
  DocLink,
  DocVersion,
  DocComment,
  DocTemplate,
  Memory,
  MemoryLink,
  ContextSnapshot,
  AgentRun,
  WorkflowDefinition,
  RoutingRule,
  Artifact,
  Edge,
  Repo,
  RepoBranch,
  RepoCommit,
  RepoFilesIndex,
  Job,
  SearchDocument,
  ModelCache,
  ProviderCredential,
  CasbinRule,
  WebhookSubscription,
  NotificationRule,
  Credential,
  TelemetryEvent,
  ErrorLog,
  ExperimentAssignment,
  FeatureFlagRollout,
  FulcrumSkill,
  SkillVersion,
};

/** Allowed options for createOrmConfig(). */
export interface OrmConfigOptions {
  /** Pre-constructed PGlite instance (for local + test mode). */
  pglite?: PGlite;
  /** Extra entities to register (in addition to the built-in list). */
  entities?: Options["entities"];
  /** Enable MikroORM debug logging. */
  debug?: boolean;
}

let defaultOrmPromise: Promise<MikroORM> | null = null;

function hasCustomOrmOptions(opts: OrmConfigOptions): boolean {
  return opts.pglite !== undefined ||
    opts.debug !== undefined ||
    (opts.entities !== undefined && (!Array.isArray(opts.entities) || opts.entities.length > 0));
}

/**
 * Builds a MikroORM Options object.
 *
 * - When `pglite` is provided → uses the PGlite Kysely dialect (local/test mode).
 * - When DATABASE_URL starts with "postgresql://" or "postgres://" → uses the
 *   standard @mikro-orm/postgresql driver (SaaS mode).
 * - Defaults to in-memory PGlite when neither is present.
 */
export function createOrmConfig(opts: OrmConfigOptions = {}): Options {
  const { pglite, entities = [], debug = false } = opts;
  const dbUrl = process.env["DATABASE_URL"] ?? "";

  const isSaas =
    dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");

  // Built-in entities (auth + core + stub domains + migration ledger, decorator classes).
  // Stub entities (Task..SearchDocument, CasbinRule..NotificationRule) carry
  // composite-index decorators from day 1 so later pillars only ALTER TABLE.
  const builtinEntities: Options["entities"] = [
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
    TaskStatus,
    Sprint,
    SavedView,
    Document,
    DocLink,
    DocVersion,
    DocComment,
    DocTemplate,
    Memory,
    MemoryLink,
    ContextSnapshot,
    AgentRun,
    WorkflowDefinition,
    RoutingRule,
    Artifact,
    Edge,
    Repo,
    RepoBranch,
    RepoCommit,
    RepoFilesIndex,
    Job,
    SearchDocument,
    ModelCache,
    ProviderCredential,
    CasbinRule,
    WebhookSubscription,
    NotificationRule,
    Credential,
    TelemetryEvent,
    ErrorLog,
    ExperimentAssignment,
    FeatureFlagRollout,
    FulcrumSkill,
    SkillVersion,
  ];

  const allEntities: Options["entities"] = [...builtinEntities, ...entities];

  if (isSaas) {
    // SaaS: standard PostgreSQL driver
    return {
      dbName: new URL(dbUrl).pathname.slice(1) || "fulcrum",
      clientUrl: dbUrl,
      entities: allEntities,
      migrations: {
        path: new URL("./migrations", import.meta.url).pathname,
        pathTs: new URL("./migrations", import.meta.url).pathname,
      },
      extensions: [Migrator],
      debug,
    };
  }

  // Local / test: PGlite via PGliteKyselyDialect
  const getPglite = pglite
    ? () => pglite
    : () => import("@electric-sql/pglite").then(({ PGlite }) => new PGlite());

  const dialect = new PGliteKyselyDialect(getPglite);

  return {
    // dbName is required by MikroORM even though PGlite ignores it
    dbName: "postgres",
    // Pass our dialect as driverOptions — AbstractSqlConnection checks for createDriver()
    driverOptions: dialect,
    // PGlite does not support multiple statements in a single prepared query.
    // Setting false causes SqlSchemaGenerator to split DDL on ';\n' before executing.
    multipleStatements: false,
    entities: allEntities,
    migrations: {
      path: new URL("./migrations", import.meta.url).pathname,
      pathTs: new URL("./migrations", import.meta.url).pathname,
    },
    extensions: [Migrator],
    debug,
  };
}

/** Convenience: initialise an ORM instance with the standard config. */
export async function initOrm(opts: OrmConfigOptions = {}): Promise<MikroORM> {
  const { MikroORM } = await import("@mikro-orm/postgresql");
  if (hasCustomOrmOptions(opts)) {
    return MikroORM.init(createOrmConfig(opts));
  }

  defaultOrmPromise ??= MikroORM.init(createOrmConfig()).catch((error) => {
    defaultOrmPromise = null;
    throw error;
  });
  return defaultOrmPromise;
}

export async function __resetDefaultOrmForTest(): Promise<MikroORM | null> {
  const orm = await defaultOrmPromise?.catch(() => null) ?? null;
  defaultOrmPromise = null;
  if (orm) await orm.close(true);
  return orm;
}
