/**
 * TDD — Symphony workspace lifecycle.
 *
 * RED target: services/execution-orchestration/src/infrastructure/agent-runtime/symphony/workspace.ts missing.
 * GREEN target: sanitized org-scoped directories are created, persisted on
 * claim, removed on release, and retained for failed runs when configured.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { EntityManager } from "typeorm";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { AgentRun } from "@execution-orchestration/infrastructure/database/entities/orchestration/AgentRun.ts";
import {
  createWorkspace,
  destroyWorkspace,
  sanitizeWorkspaceKey,
} from "@execution-orchestration/infrastructure/agent-runtime/symphony/workspace.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";

const TASK_ID = "12345678-90ab-cdef-0000-000000000001";
const RUN_ID = "90000000-0000-0000-0000-000000000001";
const createCaller = t.createCallerFactory(appRouter);

async function seedRun(em: EntityManager): Promise<AgentRun> {
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

  await em.save([task, run]);
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
  it("replaces characters outside the Symphony workspace naming invariant", () => {
    expect(sanitizeWorkspaceKey("Fix: API/Auth 🚀 #42!", TASK_ID)).toBe(
      "Fix__API_Auth_____42_",
    );
  });

  it("uses the task id fallback when a title sanitizes to empty", () => {
    expect(sanitizeWorkspaceKey("", TASK_ID)).toBe("12345678");
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
  let lastDb: TestOrm | undefined;

  afterAll(async () => {
    await lastDb?.close();
  });

  it("creates an org-scoped directory and stores workspacePath on claim", async () => {
    lastDb = await createTestOrm();
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workspaces-"));
    try {
      const run = await seedRun(lastDb.em);
      const workspacePath = await createWorkspace(run, {
        em: lastDb.em,
        root,
      });

      expect(workspacePath).toBe(
        join(root, DEFAULT_ORG_ID, sanitizeWorkspaceKey(TASK_ID, TASK_ID)),
      );
      expect(await exists(workspacePath)).toBe(true);

      const reloaded = await lastDb.em.findOneOrFail(AgentRun, RUN_ID);
      expect(reloaded.workspacePath).toBe(workspacePath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("removes workspace directory and clears workspacePath on release", async () => {
    const db = await createTestOrm();
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workspaces-"));
    try {
      const run = await seedRun(db.em);
      const workspacePath = await createWorkspace(run, { em: db.em, root });

      await destroyWorkspace(run, { em: db.em, root, keepOnFailure: false });

      expect(await exists(workspacePath)).toBe(false);
      const reloaded = await db.em.findOneOrFail(AgentRun, RUN_ID);
      expect(reloaded.workspacePath).toBeNull();
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps failed workspaces when keepOnFailure is enabled", async () => {
    const db = await createTestOrm();
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workspaces-"));
    try {
      const run = await seedRun(db.em);
      const workspacePath = await createWorkspace(run, { em: db.em, root });
      run.orchestrationState = "failed";

      await destroyWorkspace(run, { em: db.em, root, keepOnFailure: true });

      expect(await exists(workspacePath)).toBe(true);
      const reloaded = await db.em.findOneOrFail(AgentRun, RUN_ID);
      expect(reloaded.workspacePath).toBe(workspacePath);
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("removes a workspace without an entity manager", async () => {
    const db = await createTestOrm();
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workspaces-"));
    try {
      const run = await seedRun(db.em);
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
    const db = await createTestOrm();
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workspaces-"));
    try {
      const run = await seedRun(db.em);
      run.workspacePath = tmpdir();

      await expect(
        destroyWorkspace(run, { em: db.em, root }),
      ).rejects.toThrow(/outside org root/i);
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses to remove the org workspace root itself", async () => {
    const db = await createTestOrm();
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workspaces-"));
    try {
      const run = await seedRun(db.em);
      run.workspacePath = join(root, DEFAULT_ORG_ID);
      await mkdir(run.workspacePath, { recursive: true });

      await expect(
        destroyWorkspace(run, { em: db.em, root }),
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
    const db = await createTestOrm();
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workspaces-"));
    try {
      const run = await seedRun(db.em);
      const workspacePath = await createWorkspace(run, { em: db.em, root });
      const caller = createCaller(
        createContext({
          session: mockSession() as unknown as import("better-auth").Session,
          orgId: DEFAULT_ORG_ID,
          userId: "user-workspace-test",
          em: db.em,
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
