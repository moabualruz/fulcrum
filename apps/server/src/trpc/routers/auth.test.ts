import { afterEach, describe, expect, mock, test } from "bun:test";

import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";

const resolveApplicationSessionContext = mock(async () => ({
  userId: USER_ID,
  orgId: ORG_ID,
  sessionId: "session",
  email: "user@example.test",
  role: "owner",
  orgName: "Acme",
  passkeyCount: 1,
}));

let restoreApplication: (() => void) | null = null;

afterEach(() => {
  restoreApplication?.();
  restoreApplication = null;
  resolveApplicationSessionContext.mockClear();
});

async function caller() {
  const { __setAuthApplicationForTest, authRouter } = await import("./auth.ts");
  restoreApplication = __setAuthApplicationForTest({ resolveApplicationSessionContext });
  const createCaller = t.createCallerFactory(authRouter);
  return createCaller(createContext({
    session: {
      id: "session",
      token: "session",
      userId: USER_ID,
      orgId: ORG_ID,
      activeOrganizationId: ORG_ID,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    } as never,
    orgId: ORG_ID,
    userId: USER_ID,
    em: { marker: "adapter-em" } as never,
    container: null,
  }));
}

describe("auth tRPC adapter", () => {
  test("whoami delegates session enrichment to application auth", async () => {
    const trpc = await caller();
    const result = await trpc.whoami();

    expect(result).toMatchObject({
      userId: USER_ID,
      orgId: ORG_ID,
      email: "user@example.test",
      role: "owner",
      orgName: "Acme",
      passkeyCount: 1,
    });
    expect(resolveApplicationSessionContext).toHaveBeenCalledTimes(1);
    const [em, appCtx] = resolveApplicationSessionContext.mock.calls[0] as unknown as [
      unknown,
      { orgId: string; userId: string; session: { id: string } },
    ];
    expect(em).toMatchObject({ marker: "adapter-em" });
    expect(appCtx).toMatchObject({ orgId: ORG_ID, userId: USER_ID });
    expect(appCtx.session.id).toBe("session");
  });
});
