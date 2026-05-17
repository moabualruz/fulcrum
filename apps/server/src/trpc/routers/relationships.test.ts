import { describe, expect, test } from "bun:test";

import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { relationshipsRouter } from "./relationships.ts";

describe("relationships tRPC router", () => {
  test("summary returns typed counts and selected expansions without EntityManager", async () => {
    const createCaller = t.createCallerFactory(relationshipsRouter);
    const caller = createCaller(createContext({
      orgId: "org-1",
      userId: "user-1",
      session: {
        id: "session-1",
        token: "session-1",
        userId: "user-1",
        orgId: "org-1",
        activeOrganizationId: "org-1",
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
        ipAddress: null,
        userAgent: null,
      } as never,
      em: null,
      container: null,
    }));

    const result = await caller.summary({
      entity: { kind: "work_item", id: "task-1" },
      trace: {
        workspace: { kind: "workspace", id: "workspace-1" },
        project: { kind: "project", id: "project-1" },
        workItem: { kind: "work_item", id: "task-1" },
      },
      refs: [
        { kind: "doc", id: "doc-1" },
        { kind: "run", id: "run-1" },
      ],
      include: ["runs"],
    });

    expect(result.counts).toMatchObject({ docs: 1, runs: 1 });
    expect(result.expanded?.runs).toEqual([{ kind: "run", id: "run-1" }]);
    expect(result.expanded?.docs).toBeUndefined();
  });
});
