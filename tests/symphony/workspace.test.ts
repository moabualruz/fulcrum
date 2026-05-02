/**
 * TDD — Symphony workspace lifecycle.
 *
 * RED target: src/orchestration/symphony/workspace.ts missing.
 * GREEN target: sanitized org-scoped directories are created, persisted on
 * claim, removed on release, and retained for failed runs when configured.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { MigrationObject } from "@mikro-orm/core";
import type { MikroORM, Options } from "@mikro-orm/postgresql";
import { MikroORM as MikroORMRuntime } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig } from "../../src/db/mikro-orm.config.ts";
import { DEFAULT_ORG_ID, SeedService } from "../../src/db/seed.ts";
import { Org } from "../../src/db/entities/auth/Org.ts";
import { Task } from "../../src/db/entities/tasks/Task.ts";
import { AgentRun } from "../../src/db/entities/orchestration/AgentRun.ts";
import { Migration20260501104413_auth } from "../../src/db/migrations/Migration20260501104413_auth.ts";
import { Migration20260501120537_events_org_id_backfill } from "../../src/db/migrations/Migration20260501120537_events_org_id_backfill.ts";
import { Migration20260501120538_events_org_id_notnull } from "../../src/db/migrations/Migration20260501120538_events_org_id_notnull.ts";
import { Migration20260501130000_composite_indexes } from "../../src/db/migrations/Migration20260501130000_composite_indexes.ts";
import { Migration20260501130100_flag_stubs } from "../../src/db/migrations/Migration20260501130100_flag_stubs.ts";
import { Migration20260501140000_schema_migration_ledger } from "../../src/db/migrations/Migration20260501140000_schema_migration_ledger.ts";
import { Migration20260501150000_account_verification } from "../../src/db/migrations/Migration20260501150000_account_verification.ts";
import { Migration20260502000001_orchestration_workflow_definitions } from "../../src/db/migrations/Migration20260502000001_orchestration_workflow_definitions.ts";
import { Migration20260502030300_agent_runs_symphony_columns } from "../../src/db/migrations/Migration20260502030300_agent_runs_symphony_columns.ts";
import { Migration20260502050000_routing_rules } from "../../src/db/migrations/Migration20260502050000_routing_rules.ts";
import { Migration20260502050200_skills_registry } from "../../src/db/migrations/Migration20260502050200_skills_registry.ts";
import { Migration20260502070100_docs_document_columns } from "../../src/db/migrations/Migration20260502070100_docs_document_columns.ts";
import { Migration20260502070200_docs_related_tables } from "../../src/db/migrations/Migration20260502070200_docs_related_tables.ts";
import { Migration20260502070400_agent_runs_sandcastle_columns } from "../../src/db/migrations/Migration20260502070400_agent_runs_sandcastle_columns.ts";
import { Migration20260502090000_tasks_schema_extension } from "../../src/db/migrations/Migration20260502090000_tasks_schema_extension.ts";
import {
  createWorkspace,
  destroyWorkspace,
  sanitizeWorkspaceKey,
} from "../../src/orchestration/symphony/workspace.ts";
import { appRouter } from "../../src/trpc/router.ts";
import { createContext } from "../../src/trpc/context.ts";
import { t } from "../../src/trpc/trpc.ts";

const TASK_ID = "12345678-90ab-cdef-0000-000000000001";
const RUN_ID = "90000000-0000-0000-0000-000000000001";
const createCaller = t.createCallerFactory(appRouter);

interface BlankOrm {
  orm: MikroORM;
  pglite: PGlite;
  close: () => Promise<void>;
}

async function buildMigratedOrm(): Promise<BlankOrm> {
  const pglite = new PGlite();
  const config = createOrmConfig({ pglite });

  config.migrations = {
    ...((config.migrations ?? {}) as NonNullable<Options["migrations"]>),
    transactional: false,
    allOrNothing: false,
    snapshot: false,
    migrationsList: [
      { name: "Migration20260501104413_auth", class: Migration20260501104413_auth },
      {
        name: "Migration20260501120537_events_org_id_backfill",
        class: Migration20260501120537_events_org_id_backfill,
      },
      {
        name: "Migration20260501120538_events_org_id_notnull",
        class: Migration20260501120538_events_org_id_notnull,
      },
      {
        name: "Migration20260501130000_composite_indexes",
        class: Migration20260501130000_composite_indexes,
      },
      {
        name: "Migration20260501130100_flag_stubs",
        class: Migration20260501130100_flag_stubs,
      },
      {
        name: "Migration20260501140000_schema_migration_ledger",
        class: Migration20260501140000_schema_migration_ledger,
      },
      {
        name: "Migration20260501150000_account_verification",
        class: Migration20260501150000_account_verification,
      },
      {
        name: "Migration20260502000001_orchestration_workflow_definitions",
        class: Migration20260502000001_orchestration_workflow_definitions,
      },
      {
        name: "Migration20260502030300_agent_runs_symphony_columns",
        class: Migration20260502030300_agent_runs_symphony_columns,
      },
      {
        name: "Migration20260502050000_routing_rules",
        class: Migration20260502050000_routing_rules,
      },
      {
        name: "Migration20260502050200_skills_registry",
        class: Migration20260502050200_skills_registry,
      },
      {
        name: "Migration20260502070100_docs_document_columns",
        class: Migration20260502070100_docs_document_columns,
      },
      {
        name: "Migration20260502070200_docs_related_tables",
        class: Migration20260502070200_docs_related_tables,
      },
      {
        name: "Migration20260502070400_agent_runs_sandcastle_columns",
        class: Migration20260502070400_agent_runs_sandcastle_columns,
      },
      {
        name: "Migration20260502090000_tasks_schema_extension",
        class: Migration20260502090000_tasks_schema_extension,
      },
    ] satisfies MigrationObject[],
  };
  config.extensions = [Migrator];

  const orm = await MikroORMRuntime.init(config);
  await orm.migrator.up();
  await new SeedService(orm.em).run();

  return {
    orm,
    pglite,
    close: async () => {
      await orm.close(true);
      await (pglite as { close?: () => Promise<void> }).close?.();
    },
  };
}

async function seedRun(orm: MikroORM): Promise<AgentRun> {
  const em = orm.em.fork();
  const org = em.getReference(Org, DEFAULT_ORG_ID);
  const task = em.create(Task, {
    id: TASK_ID,
    org,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    blockedByIds: [],
    status: "ready",
    priority: 1,
  });
  const run = em.create(AgentRun, {
    id: RUN_ID,
    org,
    task,
    createdAt: new Date("2026-02-01T01:00:00.000Z"),
    startedAt: new Date("2026-02-01T01:00:00.000Z"),
    orchestrationState: "claimed",
    attemptCount: 0,
    sandboxMode: "host",
    iterationCount: 0,
  });

  em.persist([task, run]);
  await em.flush();
  return run;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function mockSession() {
  return {
    id: "sess-workspace-test",
    userId: "user-workspace-test",
    orgId: DEFAULT_ORG_ID,
    activeOrganizationId: DEFAULT_ORG_ID,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-workspace-test",
    ipAddress: null,
    userAgent: null,
  };
}

describe("sanitizeWorkspaceKey", () => {
  it("strips characters outside the Symphony workspace naming invariant", () => {
    expect(sanitizeWorkspaceKey("Fix: API/Auth 🚀 #42!", TASK_ID)).toBe(
      "FixAPIAuth42",
    );
  });

  it("uses the task id fallback when a title sanitizes to empty", () => {
    expect(sanitizeWorkspaceKey("🚀 #!!", TASK_ID)).toBe("12345678");
  });

  it("appends the task id suffix when a sanitized key collides", () => {
    expect(
      sanitizeWorkspaceKey("Duplicate", TASK_ID, {
        existingKeys: new Set(["Duplicate"]),
      }),
    ).toBe("Duplicate_12345678");
  });

  it("keeps suffixing when both the base and first collision key exist", () => {
    expect(
      sanitizeWorkspaceKey("Duplicate", TASK_ID, {
        existingKeys: new Set(["Duplicate", "Duplicate_12345678"]),
      }),
    ).toBe("Duplicate_12345678_2");
  });

  it("keeps suffixing past the second collision", () => {
    expect(
      sanitizeWorkspaceKey("Duplicate", TASK_ID, {
        existingKeys: new Set([
          "Duplicate",
          "Duplicate_12345678",
          "Duplicate_12345678_2",
        ]),
      }),
    ).toBe("Duplicate_12345678_3");
  });

  it("throws instead of looping forever when every collision candidate is taken", () => {
    const existingKeys = new Set(["Duplicate"]);
    for (let attempt = 1; attempt <= 1_000; attempt += 1) {
      existingKeys.add(
        attempt === 1
          ? "Duplicate_12345678"
          : `Duplicate_12345678_${attempt}`,
      );
    }

    expect(() => sanitizeWorkspaceKey("Duplicate", TASK_ID, { existingKeys }))
      .toThrow(/Unable to allocate unique workspace key/);
  });

  it("keeps collision-suffixed keys within 128 characters", () => {
    const title = "a".repeat(140);
    const key = sanitizeWorkspaceKey(title, TASK_ID, {
      existingKeys: new Set(["a".repeat(128)]),
    });

    expect(key).toHaveLength(128);
    expect(key.endsWith("_12345678")).toBe(true);
  });
});

describe("Symphony workspace lifecycle", () => {
  let lastDb: BlankOrm | undefined;

  afterAll(async () => {
    await lastDb?.close();
  });

  it("creates an org-scoped directory and stores workspacePath on claim", async () => {
    lastDb = await buildMigratedOrm();
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workspaces-"));
    try {
      const run = await seedRun(lastDb.orm);
      const workspacePath = await createWorkspace(run, {
        em: lastDb.orm.em,
        root,
      });

      expect(workspacePath).toBe(
        join(root, DEFAULT_ORG_ID, sanitizeWorkspaceKey(TASK_ID, TASK_ID)),
      );
      expect(await exists(workspacePath)).toBe(true);

      const reloaded = await lastDb.orm.em.fork().findOneOrFail(AgentRun, RUN_ID);
      expect(reloaded.workspacePath).toBe(workspacePath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("removes workspace directory and clears workspacePath on release", async () => {
    const db = await buildMigratedOrm();
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workspaces-"));
    try {
      const run = await seedRun(db.orm);
      const workspacePath = await createWorkspace(run, { em: db.orm.em, root });

      await destroyWorkspace(run, { em: db.orm.em, root, keepOnFailure: false });

      expect(await exists(workspacePath)).toBe(false);
      const reloaded = await db.orm.em.fork().findOneOrFail(AgentRun, RUN_ID);
      expect(reloaded.workspacePath).toBeNull();
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps failed workspaces when keepOnFailure is enabled", async () => {
    const db = await buildMigratedOrm();
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workspaces-"));
    try {
      const run = await seedRun(db.orm);
      const workspacePath = await createWorkspace(run, { em: db.orm.em, root });
      run.orchestrationState = "failed";

      await destroyWorkspace(run, { em: db.orm.em, root, keepOnFailure: true });

      expect(await exists(workspacePath)).toBe(true);
      const reloaded = await db.orm.em.fork().findOneOrFail(AgentRun, RUN_ID);
      expect(reloaded.workspacePath).toBe(workspacePath);
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("removes a workspace without an entity manager", async () => {
    const db = await buildMigratedOrm();
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workspaces-"));
    try {
      const run = await seedRun(db.orm);
      const workspacePath = await createWorkspace(run, { root });

      await destroyWorkspace(run, { root });

      expect(await exists(workspacePath)).toBe(false);
      expect(run.workspacePath).toBeUndefined();
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses to remove a workspace path outside the org root", async () => {
    const db = await buildMigratedOrm();
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workspaces-"));
    try {
      const run = await seedRun(db.orm);
      run.workspacePath = tmpdir();

      await expect(
        destroyWorkspace(run, { em: db.orm.em, root }),
      ).rejects.toThrow(/outside org root/i);
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses to remove the org workspace root itself", async () => {
    const db = await buildMigratedOrm();
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workspaces-"));
    try {
      const run = await seedRun(db.orm);
      run.workspacePath = join(root, DEFAULT_ORG_ID);
      await mkdir(run.workspacePath, { recursive: true });

      await expect(
        destroyWorkspace(run, { em: db.orm.em, root }),
      ).rejects.toThrow(/outside org root/i);
      expect(await exists(run.workspacePath)).toBe(true);
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("orchestration.getWorkspacePath tRPC procedure", () => {
  it("returns the workspace path for an org-scoped run", async () => {
    const db = await buildMigratedOrm();
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workspaces-"));
    try {
      const run = await seedRun(db.orm);
      const workspacePath = await createWorkspace(run, { em: db.orm.em, root });
      const caller = createCaller(
        createContext({
          session: mockSession() as unknown as import("better-auth").Session,
          orgId: DEFAULT_ORG_ID,
          userId: "user-workspace-test",
          em: db.orm.em.fork(),
          container: null,
        }),
      );

      await expect(caller.orchestration.getWorkspacePath({
        orgId: DEFAULT_ORG_ID,
        runId: RUN_ID,
      })).resolves.toEqual({ runId: RUN_ID, workspacePath });

      await expect(caller.orchestration.getRun({ runId: RUN_ID }))
        .resolves.toMatchObject({
          id: RUN_ID,
          state: "claimed",
          orchestrationState: "claimed",
          workspacePath,
          renderedPrompt: null,
        });
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
