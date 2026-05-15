import { describe, expect, test } from "bun:test";
import type { Session } from "better-auth";

import { createTestOrm } from "@test-support/application-database.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const REPO_ID = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "33333333-3333-4333-8333-333333333333";

function mockSession(): Session {
  return {
    id: "sess-workflow-agent-dispatch",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-workflow-agent-dispatch",
    ipAddress: null,
    userAgent: null,
  } as unknown as Session;
}

function callerFor(em: import("@mikro-orm/postgresql").EntityManager) {
  return createCaller(createContext({
    session: mockSession(),
    orgId: ORG_ID,
    userId: USER_ID,
    em,
    container: null,
  }));
}

async function seedDispatchTask(em: import("@mikro-orm/postgresql").EntityManager, withRepo = true) {
  const conn = em.getConnection();
  await conn.execute(`INSERT INTO projects (id, org_id, name) VALUES (?, ?, ?)`, [PROJECT_ID, ORG_ID, "Agent Project"]);
  if (withRepo) {
    await conn.execute(
      `INSERT INTO repos (id, org_id, name, slug, kind, local_path) VALUES (?, ?, ?, ?, ?, ?)`,
      [REPO_ID, ORG_ID, "Repo", "repo", "local", "/tmp/repo"],
    );
  }
  await conn.execute(
    `INSERT INTO tasks (id, org_id, project_id, repo_id, title, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [TASK_ID, ORG_ID, PROJECT_ID, withRepo ? REPO_ID : null, "Dispatchable task", "ready"],
  );
}

describe("workflow agent run dispatch", () => {
  test("dispatch returns run id with context, routing, repo, and authority trace", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await seedDispatchTask(em);
      const caller = callerFor(em);

      const result = await caller.orchestration.dispatchRun({
        taskId: TASK_ID,
        projectId: PROJECT_ID,
        agentName: "codex",
        sandboxMode: "docker",
        includeGlobal: true,
      });

      const sourceRefs = result.trace.context.sourceRefs as unknown[];
      expect(Array.isArray(sourceRefs)).toBe(true);
      expect(sourceRefs).toContainEqual({
        kind: "task",
        id: TASK_ID,
        reason: "selected-task",
        scope: "project",
      });
      expect(result).toMatchObject({
        state: "unclaimed",
        agent: "codex",
        sandboxMode: "docker",
        trace: {
          taskId: TASK_ID,
          projectId: PROJECT_ID,
          repoId: REPO_ID,
          context: { sourceRefs: expect.any(Array), includeGlobal: true },
          routing: { selectedAgent: "codex", reason: "explicit-agent" },
          authority: {
            trustMode: "assisted",
            approvalRequired: false,
            reason: "most-restrictive-policy",
            sources: {
              agentProfile: "assisted",
              workflowDefault: "assisted",
              projectPolicy: "assisted",
              runOverride: null,
            },
          },
        },
      });
    } finally {
      await db.close();
    }
  });

  test("dispatch rejects tasks without a repo trace", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await seedDispatchTask(em, false);
      const caller = callerFor(em);

      await expect(caller.orchestration.dispatchRun({
        taskId: TASK_ID,
        projectId: PROJECT_ID,
        agentName: "codex",
      })).rejects.toThrow("Dispatch requires task repo trace.");
    } finally {
      await db.close();
    }
  });
});
