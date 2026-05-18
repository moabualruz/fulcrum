import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";

import { createContext } from "@fulcrum/server/trpc/context.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);

function session() {
  return {
    id: "session-time-entries",
    userId: "00000000-0000-4000-8000-000000000001",
    orgId: "00000000-0000-4000-8000-000000000002",
    activeOrganizationId: "00000000-0000-4000-8000-000000000002",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "token-time-entries",
    ipAddress: null,
    userAgent: null,
  };
}

describe("timeEntries tRPC router", () => {
  test("rejects unauthenticated local callers", async () => {
    const caller = createCaller(createContext({
      session: null,
      orgId: null,
      userId: null,
      em: null,
      container: null,
    }));

    let error: TRPCError | null = null;
    try {
      await caller.timeEntries.list({});
    } catch (caught) {
      if (caught instanceof TRPCError) error = caught;
    }

    expect(error?.code).toBe("UNAUTHORIZED");
  });

  test("authenticated callers reach real persistence guard instead of a stub", async () => {
    const caller = createCaller(createContext({
      session: session() as unknown as import("better-auth").Session,
      orgId: "00000000-0000-4000-8000-000000000002",
      userId: "00000000-0000-4000-8000-000000000001",
      em: null,
      container: null,
    }));

    let error: TRPCError | null = null;
    try {
      await caller.timeEntries.summary({});
    } catch (caught) {
      if (caught instanceof TRPCError) error = caught;
    }

    expect(error?.code).toBe("INTERNAL_SERVER_ERROR");
    expect(error?.message).toBe("EntityManager required.");
  });
});
