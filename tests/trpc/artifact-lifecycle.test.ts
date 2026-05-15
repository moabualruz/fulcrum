import { describe, expect, test } from "bun:test";
import type { Session } from "better-auth";

import { createTestOrm } from "@test-support/application-database.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "00000000-0000-0000-0000-000000000010";

function mockSession(): Session {
  return {
    id: "sess-artifact-lifecycle",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-artifact-lifecycle",
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

describe("artifacts lifecycle tRPC", () => {
  test("accepts and rejects artifacts without losing source metadata", async () => {
    const db = await createTestOrm();
    try {
      const caller = callerFor(db.em.fork());
      await db.em.getConnection().execute(
        `INSERT INTO orgs (id, name, slug) VALUES (?, ?, ?)`,
        [ORG_ID, "Artifact Org", "artifact-org"],
      );
      const artifact = await caller.artifacts.upload({
        filename: "run-summary.md",
        mime: "text/markdown",
        sizeBytes: "42",
        metadataJson: { sourceKind: "run", sourceId: "run-1" },
      });

      const accepted = await caller.artifacts.accept({ id: artifact.id });
      expect(accepted.lifecycleState).toBe("accepted");
      expect(accepted.metadataJson).toMatchObject({
        sourceKind: "run",
        sourceId: "run-1",
        lifecycleState: "accepted",
      });

      const rejected = await caller.artifacts.reject({ id: artifact.id });
      expect(rejected.lifecycleState).toBe("rejected");
      expect(rejected.metadataJson).toMatchObject({
        sourceKind: "run",
        sourceId: "run-1",
        lifecycleState: "rejected",
      });
    } finally {
      await db.close();
    }
  });
});
