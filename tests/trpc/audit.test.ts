import { describe, expect, test } from "bun:test";
import { Container } from "@needle-di/core";

import { createTestOrm } from "../../src/test-utils/db.ts";
import { createContext } from "../../src/trpc/context.ts";
import { appRouter } from "../../src/trpc/router.ts";
import { t } from "../../src/trpc/trpc.ts";
import { Event } from "../../src/db/entities/core/Event.ts";
import { Org } from "../../src/db/entities/auth/Org.ts";
import { User } from "../../src/db/entities/auth/User.ts";
import {
  getPayloadSchema,
  isPayloadSchemaRegistered,
} from "../../src/platform/audit-events.ts";

const createCaller = t.createCallerFactory(appRouter);

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function mockSession(userId: string, orgId: string) {
  return {
    id: `sess-${userId.slice(-8)}`,
    userId,
    orgId,
    activeOrganizationId: orgId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: `tok-${userId.slice(-8)}`,
    ipAddress: null,
    userAgent: null,
  };
}

function callerFor(em: import("@mikro-orm/postgresql").EntityManager, userId: string) {
  return createCaller(
    createContext({
      session: mockSession(userId, ORG_ID) as unknown as import("better-auth").Session,
      orgId: ORG_ID,
      userId,
      em,
      container: new Container(),
    }),
  );
}

async function persistEvent(
  em: import("@mikro-orm/postgresql").EntityManager,
  input: {
    id: string;
    userId: string;
    verb: string;
    subjectKind: string;
    subjectId?: string;
    projectId?: string;
    createdAt: Date;
  },
) {
  const event = em.create(Event, {
    id: input.id,
    org: em.getReference(Org, ORG_ID),
    user: em.getReference(User, input.userId),
    verb: input.verb,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    payload: input.projectId ? { projectId: input.projectId } : {},
    createdAt: input.createdAt,
  });
  em.persist(event);
  return event;
}

describe("audit tRPC router", () => {
  test("query filters by kind, verb, project, user, and date range with newest-first pagination", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await persistEvent(em, {
        id: "00000000-0000-4000-8000-000000000101",
        userId: db.seed.userId,
        verb: "task.status_changed",
        subjectKind: "task",
        subjectId: "task-1",
        projectId: PROJECT_ID,
        createdAt: new Date("2026-02-02T12:00:00Z"),
      });
      await persistEvent(em, {
        id: "00000000-0000-4000-8000-000000000102",
        userId: db.seed.userId,
        verb: "task.status_changed",
        subjectKind: "task",
        subjectId: "task-2",
        projectId: PROJECT_ID,
        createdAt: new Date("2026-02-03T12:00:00Z"),
      });
      await persistEvent(em, {
        id: "00000000-0000-4000-8000-000000000103",
        userId: db.seed.userId,
        verb: "doc.updated",
        subjectKind: "doc",
        subjectId: "doc-1",
        projectId: PROJECT_ID,
        createdAt: new Date("2026-02-04T12:00:00Z"),
      });
      await persistEvent(em, {
        id: "00000000-0000-4000-8000-000000000104",
        userId: db.seed.userId,
        verb: "task.status_changed",
        subjectKind: "task",
        subjectId: "task-old",
        projectId: PROJECT_ID,
        createdAt: new Date("2026-01-01T12:00:00Z"),
      });
      await em.flush();

      const caller = callerFor(em, db.seed.userId);
      const firstPage = await caller.audit.query({
        subjectKind: "task",
        verb: "task.status_changed",
        projectId: PROJECT_ID,
        userId: db.seed.userId,
        dateRange: {
          from: new Date("2026-02-01T00:00:00Z"),
          to: new Date("2026-02-28T23:59:59Z"),
        },
        limit: 1,
        offset: 0,
      });

      expect(firstPage.total).toBe(2);
      expect(firstPage.items.map((event) => event.id)).toEqual([
        "00000000-0000-4000-8000-000000000102",
      ]);

      const secondPage = await caller.audit.query({
        subjectKind: "task",
        verb: "task.status_changed",
        projectId: PROJECT_ID,
        dateRange: {
          from: new Date("2026-02-01T00:00:00Z"),
          to: new Date("2026-02-28T23:59:59Z"),
        },
        limit: 1,
        offset: 1,
      });

      expect(secondPage.items.map((event) => event.id)).toEqual([
        "00000000-0000-4000-8000-000000000101",
      ]);
    } finally {
      await db.close();
    }
  });

  test("export returns CSV headers and JSON rows for filtered audit events", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await persistEvent(em, {
        id: "00000000-0000-4000-8000-000000000201",
        userId: db.seed.userId,
        verb: "task.created",
        subjectKind: "task",
        subjectId: "task-3",
        createdAt: new Date("2026-03-01T10:00:00Z"),
      });
      await em.flush();

      const caller = callerFor(em, db.seed.userId);
      const csv = await caller.audit.export({
        format: "csv",
        subjectKind: "task",
        verb: "task.created",
        dateRange: {
          from: new Date("2026-03-01T00:00:00Z"),
          to: new Date("2026-03-02T00:00:00Z"),
        },
      });

      expect(csv).toEqual({
        format: "csv",
        csv: [
          "id,org_id,user_id,verb,subject_kind,subject_id,payload,created_at",
          `00000000-0000-4000-8000-000000000201,00000000-0000-0000-0000-000000000001,${db.seed.userId},task.created,task,task-3,{},2026-03-01T10:00:00.000Z`,
        ].join("\n"),
      });

      const json = await caller.audit.export({
        format: "json",
        subjectKind: "task",
        verb: "task.created",
        dateRange: {
          from: new Date("2026-03-01T00:00:00Z"),
          to: new Date("2026-03-02T00:00:00Z"),
        },
      });

      expect("rows" in json).toBe(true);
      if (!("rows" in json)) throw new Error("expected JSON audit export rows");
      expect(json.format).toBe("json");
      expect(json.rows).toHaveLength(1);
      expect(json.rows[0]?.id).toBe("00000000-0000-4000-8000-000000000201");
    } finally {
      await db.close();
    }
  });

  test("retentionPolicy set/get/list round-trips retainDays including zero forever", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em, db.seed.userId);

      const updated = await caller.audit.retentionPolicy.set({
        orgId: ORG_ID,
        projectId: null,
        retainDays: 0,
      });

      expect(updated).toMatchObject({
        orgId: ORG_ID,
        projectId: null,
        retainDays: 0,
      });

      const fetched = await caller.audit.retentionPolicy.get({
        orgId: ORG_ID,
        projectId: null,
      });
      expect(fetched).toMatchObject(updated);

      const rows = await caller.audit.retentionPolicy.list({ orgId: ORG_ID });
      expect(rows).toContainEqual(updated);
    } finally {
      await db.close();
    }
  });
});

describe("Phase 09 audit event registry", () => {
  const requiredKeys = [
    "user_setting.updated",
    "theme.updated",
    "telemetry_event.opted_in",
    "telemetry_event.opted_out",
    "telemetry_event.purged",
    "error_log.created",
    "backup.created",
    "backup.restored",
    "backup.exported",
    "backup.imported",
    "credential.created",
    "credential.updated",
    "credential.rotated",
    "credential.deleted",
    "migration.downgraded",
    "system.shutdown.completed",
  ];

  const forbiddenKeys = [
    "value",
    "secret",
    "token",
    "password",
    "apiKey",
    "api_key",
    "encrypted_value",
  ];

  test("registers exact Phase 09 audit keys", () => {
    for (const key of requiredKeys) {
      const [subjectKind, ...verbParts] = key.split(".");
      expect(isPayloadSchemaRegistered(subjectKind!, verbParts.join("."))).toBe(true);
    }
  });

  test("registered payload schemas reject secret-like keys", () => {
    for (const key of requiredKeys) {
      const [subjectKind, ...verbParts] = key.split(".");
      const schema = getPayloadSchema(subjectKind!, verbParts.join("."));
      expect(schema, key).toBeDefined();

      for (const forbiddenKey of forbiddenKeys) {
        expect(() => schema!.parse({ [forbiddenKey]: "plaintext" }), `${key}.${forbiddenKey}`).toThrow();
      }
    }
  });
});
