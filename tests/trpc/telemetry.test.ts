import { describe, expect, it, beforeEach } from "bun:test";
import { Container } from "@needle-di/core";

import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { TelemetryStore, writeTelemetryEvent } from "@fulcrum/server/trpc/routers/telemetry.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "11111111-1111-4111-8111-111111111111";

interface WrittenEvent {
  orgId: string;
  userId: string | null;
  kind: string;
  payload: Record<string, unknown>;
}

class MemoryTelemetryStore extends TelemetryStore {
  optedIn = false;
  rows: WrittenEvent[] = [];
  auditEvents: Array<{ verb: string; payload: Record<string, unknown> }> = [];

  override async getOptedIn() {
    return this.optedIn;
  }

  override async setOptedIn(value: boolean) {
    this.optedIn = value;
  }

  override async count() {
    return this.rows.length;
  }

  override async write(event: WrittenEvent) {
    this.rows.push(event);
  }

  override async purge() {
    const deleted = this.rows.length;
    this.rows = [];
    return deleted;
  }

  override async recordAudit(verb: string, payload: Record<string, unknown>) {
    this.auditEvents.push({ verb, payload });
  }
}

class SharedMemoryTelemetryStore extends MemoryTelemetryStore {
  constructor(private readonly shared: { optedIn: boolean; rows: WrittenEvent[]; auditEvents: Array<{ verb: string; payload: Record<string, unknown> }> }) {
    super();
    this.rows = shared.rows;
    this.auditEvents = shared.auditEvents;
  }

  override async getOptedIn() {
    return this.shared.optedIn;
  }

  override async setOptedIn(value: boolean) {
    this.shared.optedIn = value;
  }
}

const createCaller = t.createCallerFactory(appRouter);
let store: MemoryTelemetryStore;

function session() {
  return {
    id: "session-1",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "token",
    ipAddress: null,
    userAgent: null,
  };
}

function caller(nextStore = store) {
  const container = null;
  container.bind({ provide: TelemetryStore, useValue: nextStore });

  return createCaller(
    createContext({
      session: session() as import("better-auth").Session,
      orgId: ORG_ID,
      userId: USER_ID,
      em: null,
      container,
    }),
  );
}

beforeEach(() => {
  store = new MemoryTelemetryStore();
});

describe("telemetry collector", () => {
  it("defaults to opted out and write is no-op", async () => {
    await writeTelemetryEvent(store, ORG_ID, USER_ID, "task.created", { count: 1 });

    expect(store.rows).toHaveLength(0);
    await expect(caller().telemetry.status()).resolves.toEqual({
      opted_in: false,
      row_count: 0,
    });
  });

  it("persists opted-in events with string payload values scrubbed", async () => {
    await caller().telemetry.optIn();
    await writeTelemetryEvent(store, ORG_ID, USER_ID, "task.created", {
      count: 2,
      ok: true,
      title: "secret title",
      nested: { duration_ms: 12, path: "/Users/mkh/workspace/fulcrum/secret.md" },
      tags: ["private", 3],
      empty: null,
    });

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      orgId: ORG_ID,
      userId: USER_ID,
      kind: "task.created",
      payload: {
        count: 2,
        ok: true,
        title: null,
        nested: { duration_ms: 12, path: null },
        tags: [null, 3],
        empty: null,
      },
    });
    await expect(caller().telemetry.status()).resolves.toEqual({
      opted_in: true,
      row_count: 1,
    });
  });

  it("persists opt-in across router and store instances", async () => {
    const shared = { optedIn: false, rows: [] as WrittenEvent[], auditEvents: [] as Array<{ verb: string; payload: Record<string, unknown> }> };

    await caller(new SharedMemoryTelemetryStore(shared)).telemetry.optIn();

    await expect(caller(new SharedMemoryTelemetryStore(shared)).telemetry.status()).resolves.toEqual({
      opted_in: true,
      row_count: 0,
    });
  });

  it("optOut disables later writes and purge deletes rows", async () => {
    await caller().telemetry.optIn();
    await writeTelemetryEvent(store, ORG_ID, USER_ID, "settings.opened", { count: 1 });
    await expect(caller().telemetry.purge()).resolves.toEqual({ ok: true, deleted: 1 });

    await caller().telemetry.optOut();
    await writeTelemetryEvent(store, ORG_ID, USER_ID, "settings.opened", { count: 1 });

    await expect(caller().telemetry.status()).resolves.toEqual({
      opted_in: false,
      row_count: 0,
    });
  });

  it("emits audit events for opt-in, opt-out, and purge", async () => {
    await caller().telemetry.optIn();
    await writeTelemetryEvent(store, ORG_ID, USER_ID, "settings.opened", { count: 1 });
    await caller().telemetry.purge();
    await caller().telemetry.optOut();

    expect(store.auditEvents.map((event) => event.verb)).toEqual(["opted_in", "purged", "opted_out"]);
    expect(store.auditEvents[1]?.payload).toEqual({ deleted: 1 });
  });
});
