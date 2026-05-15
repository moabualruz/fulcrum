import { afterEach, describe, expect, test } from "bun:test";

import {
  MikroTelemetryStore,
  TELEMETRY_OPT_IN_KEY,
  createTelemetryStore,
  recordTuiRenderTelemetry,
  scrubTelemetryPayload,
  writeTelemetryEvent,
} from "@platform-core/application/telemetry/commands.ts";
import { Org, User } from "@platform-core/infrastructure/application-database/entities/auth/index.ts";
import { TenantSetting } from "@platform-core/infrastructure/application-database/entities/TenantSetting.ts";
import { TelemetryEvent } from "@platform-core/infrastructure/application-database/entities/platform/TelemetryEvent.ts";
import { DomainEventOutbox } from "@platform-core/infrastructure/application-database/entities/platform/DomainEventOutbox.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

describe("telemetry application commands", () => {
  test("records TUI render telemetry and scrubs sensitive payload fields", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const org = em.getReference(Org, DEFAULT_ORG_ID);
    const user = em.getReference(User, testDb.seed.userId);

    await recordTuiRenderTelemetry(em, {
      org,
      user,
      kind: "local_telemetry",
      screenKey: "task-board",
      route: "/tasks",
      renderMs: 42,
      occurredAt: new Date("2026-05-11T10:00:00.000Z"),
    });

    const rows = await em.find(TelemetryEvent, { org } as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toEqual({
      screen_key: "task-board",
      route: "/tasks",
      render_ms: 42,
    });
    expect(rows[0]?.occurredAt.toISOString()).toBe("2026-05-11T10:00:00.000Z");

    expect(scrubTelemetryPayload({
      title: "secret",
      count: 2,
      ok: true,
      nested: { path: "/tmp/private", ms: 12 },
      values: ["private", 3, false, null],
      missing: undefined,
    })).toEqual({
      title: null,
      count: 2,
      ok: true,
      nested: { path: null, ms: 12 },
      values: [null, 3, false, null],
      missing: null,
    });
  });

  test("MikroTelemetryStore persists opt-in, writes scrubbed events, counts, purges, and audits", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const store = new MikroTelemetryStore({
      em,
      orgId: DEFAULT_ORG_ID,
      userId: testDb.seed.userId,
    });

    expect(await store.getOptedIn()).toBe(false);
    expect(await writeTelemetryEvent(store, DEFAULT_ORG_ID, testDb.seed.userId, "task.created", {
      title: "private task",
      duration_ms: 7,
    })).toBe(false);
    expect(await store.count()).toBe(0);

    await store.setOptedIn(true);
    expect(await em.findOne(TenantSetting, { orgId: DEFAULT_ORG_ID, key: TELEMETRY_OPT_IN_KEY })).toMatchObject({
      value: true,
    });

    expect(await writeTelemetryEvent(store, DEFAULT_ORG_ID, testDb.seed.userId, "task.created", {
      title: "private task",
      duration_ms: 7,
    })).toBe(true);
    expect(await store.count()).toBe(1);

    const telemetryRows = await em.find(TelemetryEvent, { org: DEFAULT_ORG_ID } as never);
    expect(telemetryRows[0]?.payload).toEqual({ title: null, duration_ms: 7 });

    await store.recordAudit("opted_in", { opted_in: true });
    const outboxRows = await em.find(DomainEventOutbox, { org: DEFAULT_ORG_ID } as never);
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]).toMatchObject({
      verb: "telemetry.opted_in",
      subjectKind: "telemetry",
      subjectId: testDb.seed.userId,
      payload: { opted_in: true },
    });

    expect(await store.purge()).toBe(1);
    expect(await store.count()).toBe(0);

    await store.setOptedIn(false);
    expect(await store.getOptedIn()).toBe(false);
  });

  test("createTelemetryStore returns injected store and rejects missing EntityManager", async () => {
    const testDb = await freshDb();
    const injected = new MikroTelemetryStore({
      em: testDb.em.fork(),
      orgId: DEFAULT_ORG_ID,
      userId: testDb.seed.userId,
    });
    expect(createTelemetryStore({
      em: null,
      orgId: DEFAULT_ORG_ID,
      userId: testDb.seed.userId,
    }, injected)).toBe(injected);

    const missing = createTelemetryStore({
      em: null,
      orgId: DEFAULT_ORG_ID,
      userId: testDb.seed.userId,
    });
    await expect(missing.getOptedIn()).rejects.toThrow("Telemetry repository is not configured.");
  });
});
