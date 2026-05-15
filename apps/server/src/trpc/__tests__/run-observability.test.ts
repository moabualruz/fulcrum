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
    id: "sess-run-observability",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-run-observability",
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

describe("run observability", () => {
  test("orchestration.getRun returns context, artifacts, audit, memory, follow-up, and recovery buckets", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const conn = em.getConnection();
      await conn.execute(`INSERT INTO projects (id, org_id, name) VALUES (?, ?, ?)`, [PROJECT_ID, ORG_ID, "Run Project"]);
      await conn.execute(
        `INSERT INTO repos (id, org_id, name, slug, kind, local_path) VALUES (?, ?, ?, ?, ?, ?)`,
        [REPO_ID, ORG_ID, "Repo", "repo", "local", "/tmp/repo"],
      );
      await conn.execute(
        `INSERT INTO tasks (id, org_id, project_id, repo_id, title, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [TASK_ID, ORG_ID, PROJECT_ID, REPO_ID, "Observe run", "ready"],
      );
      const caller = callerFor(em);
      const dispatched = await caller.orchestration.dispatchRun({ taskId: TASK_ID, projectId: PROJECT_ID, agentName: "codex" });
      await conn.execute(
        `INSERT INTO artifacts (org_id, run_id, filename, path, mime, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?::jsonb)`,
        [ORG_ID, dispatched.runId, "summary.md", "/tmp/summary.md", "text/markdown", JSON.stringify({ lifecycleState: "accepted" })],
      );

      const detail = await caller.orchestration.getRun({ runId: dispatched.runId });

      expect(detail).toMatchObject({
        id: dispatched.runId,
        observability: {
          context: { sourceRefs: expect.any(Array) },
          artifacts: [expect.objectContaining({ filename: "summary.md", lifecycleState: "accepted" })],
          memoryCandidates: [],
          followUpTasks: [],
          audit: [expect.objectContaining({ verb: "dispatched" })],
          recovery: { retryable: true },
        },
      });
    } finally {
      await db.close();
    }
  });
});
