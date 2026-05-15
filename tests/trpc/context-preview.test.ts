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
const TASK_ID = "22222222-2222-4222-8222-222222222222";

function mockSession(): Session {
  return {
    id: "sess-context-preview",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-context-preview",
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

describe("context.preview tRPC", () => {
  test("returns deterministic source refs with explicit global inclusion", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const conn = em.getConnection();
      await conn.execute(
        `INSERT INTO projects (id, org_id, name) VALUES (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Knowledge Project"],
      );
      await conn.execute(
        `INSERT INTO tasks (id, org_id, project_id, title, status) VALUES (?, ?, ?, ?, ?)`,
        [TASK_ID, ORG_ID, PROJECT_ID, "Traceable task", "ready"],
      );
      await conn.execute(
        `INSERT INTO memories (org_id, project_id, global, kind, body, source, source_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?::jsonb), (?, ?, ?, ?, ?, ?, ?::jsonb)`,
        [
          ORG_ID, PROJECT_ID, false, "decision", "Use project context", "manual", JSON.stringify({ key: "project.rule" }),
          ORG_ID, null, true, "fact", "Use global context", "manual", JSON.stringify({ key: "global.rule" }),
        ],
      );

      const caller = callerFor(em);
      const doc = await caller.docs.create({
        title: "Task Handoff",
        projectId: PROJECT_ID,
        bodyMd: "Known task handoff",
        links: [{ targetKind: "task", targetId: TASK_ID, linkKind: "task_ref" }],
      });

      const preview = await caller.context.preview({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        includeGlobal: true,
      });

      expect(preview.bundle.documents.map((item) => item.id)).toEqual([doc.id]);
      expect(preview.bundle.memories.map((item) => item.key)).toEqual([
        "global.rule",
        "project.rule",
      ]);
      expect(preview.sourceRefs).toEqual([
        { kind: "task", id: TASK_ID, reason: "selected-task", scope: "project" },
        { kind: "doc", id: doc.id, reason: "project-doc", scope: "project" },
        { kind: "memory", id: preview.bundle.memories[0]!.id, reason: "global-memory", scope: "global" },
        { kind: "memory", id: preview.bundle.memories[1]!.id, reason: "project-memory", scope: "project" },
      ]);
      expect(preview.scope).toEqual({ projectId: PROJECT_ID, taskId: TASK_ID, includeGlobal: true });
      expect(preview.warnings).toEqual([]);
    } finally {
      await db.close();
    }
  });
});
