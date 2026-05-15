import { describe, expect, test } from "bun:test";
import { Container } from "@needle-di/core";
import { TRPCError } from "@trpc/server";

import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import {
  ErrorLogStore,
  type ErrorLogRecord,
} from "@fulcrum/server/runtime/trpc/routers/error-logs.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";

class MemoryErrorLogStore extends ErrorLogStore {
  constructor(private rows: ErrorLogRecord[]) {
    super();
  }

  async list(orgId: string, input: { limit: number; since?: Date }) {
    return this.rows
      .filter((row) => row.orgId === orgId)
      .filter((row) => !input.since || row.occurredAt >= input.since)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, input.limit);
  }

  async get(orgId: string, id: string) {
    return this.rows.find((row) => row.orgId === orgId && row.id === id) ?? null;
  }

  async clear(orgId: string, input: { before?: Date }) {
    const before = input.before;
    const original = this.rows.length;
    this.rows = this.rows.filter((row) => {
      if (row.orgId !== orgId) return true;
      return before ? row.occurredAt >= before : false;
    });
    return original - this.rows.length;
  }
}

function session() {
  return {
    id: "sess-errors",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-errors",
    ipAddress: null,
    userAgent: null,
  };
}

function caller(rows: ErrorLogRecord[], authenticated = true) {
  const container = null;
  container.bind({ provide: ErrorLogStore, useValue: new MemoryErrorLogStore(rows) });
  return t.createCallerFactory(appRouter)(
    createContext({
      session: authenticated ? session() as unknown as import("better-auth").Session : null,
      orgId: authenticated ? ORG_ID : null,
      userId: authenticated ? USER_ID : null,
      em: null,
      container,
    }),
  );
}

function row(overrides: Partial<ErrorLogRecord>): ErrorLogRecord {
  return {
    id: overrides.id ?? "err-1",
    orgId: overrides.orgId ?? ORG_ID,
    userId: overrides.userId ?? USER_ID,
    occurredAt: overrides.occurredAt ?? new Date("2026-05-03T10:00:00.000Z"),
    os: overrides.os ?? "darwin",
    arch: overrides.arch ?? "arm64",
    bunVersion: overrides.bunVersion ?? "1.3.0",
    fulcrumVersion: overrides.fulcrumVersion ?? "0.1.0",
    recentCliCommand: overrides.recentCliCommand ?? "fulcrum web",
    recentTrpcProcedure: overrides.recentTrpcProcedure ?? "tasks.list",
    errorMessage: overrides.errorMessage ?? "boom",
    stackTrace: overrides.stackTrace ?? "Error: boom\n at run (<cwd>/apps/cli/src/main.ts:1:1)",
    context: overrides.context ?? { source: "uncaughtException" },
  };
}

describe("errorLogs tRPC router", () => {
  test("requires authentication", async () => {
    let error: TRPCError | null = null;
    try {
      await caller([], false).errorLogs.list();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }

    expect(error?.code).toBe("UNAUTHORIZED");
  });

  test("list returns newest-first paginated rows and applies since filter", async () => {
    const rows = [
      row({ id: "old", occurredAt: new Date("2026-05-01T00:00:00.000Z") }),
      row({ id: "new", occurredAt: new Date("2026-05-03T00:00:00.000Z") }),
      row({ id: "other-org", orgId: "00000000-0000-0000-0000-000000000099" }),
    ];

    const result = await caller(rows).errorLogs.list({
      limit: 10,
      since: "2026-05-02T00:00:00.000Z",
    });

    expect(result.map((item) => item.id)).toEqual(["new"]);
    const latest = result[0];
    expect(latest).toBeDefined();
    expect(latest?.id).toBe("new");
    expect(latest?.occurredAt).toEqual(new Date("2026-05-03T00:00:00.000Z"));
  });

  test("get returns full entry including stack trace", async () => {
    const result = await caller([
      row({ id: "err-1", stackTrace: "Error: boom\n at run (<cwd>/apps/cli/src/main.ts:1:1)" }),
    ]).errorLogs.get({ id: "err-1" });

    expect(result?.id).toBe("err-1");
    expect(result?.stackTrace).toContain("<cwd>/apps/cli/src/main.ts");
  });

  test("clear deletes matching rows and reports count", async () => {
    const c = caller([
      row({ id: "old", occurredAt: new Date("2026-05-01T00:00:00.000Z") }),
      row({ id: "new", occurredAt: new Date("2026-05-03T00:00:00.000Z") }),
    ]);

    await expect(c.errorLogs.clear({ before: "2026-05-02T00:00:00.000Z" })).resolves.toEqual({
      ok: true,
      deleted: 1,
    });
    await expect(c.errorLogs.list()).resolves.toHaveLength(1);
  });
});
