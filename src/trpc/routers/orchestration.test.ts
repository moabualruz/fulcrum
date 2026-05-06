import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../test-support/product-fixtures.ts";
import { createLocalOrg } from "../../test-support/product-fixtures.ts";
import {
  clearHooks,
  createRun,
  registerHook,
  type SymphonyRunRow,
} from "../../test-support/product-fixtures.ts";
import { createContext } from "../context.ts";
import { orchestrationRouter } from "./orchestration.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-orch-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

afterEach(() => {
  clearHooks();
});

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  return db;
}

// Create a tRPC caller bound to a context
function createCaller(db: ReturnType<typeof openIsolatedStore> extends Promise<infer T> ? T : never, orgId: string) {
  const userId = "user-1";
  return orchestrationRouter.createCaller(
    createContext({
      db,
      orgId,
      session: {
        id: "session-1",
        userId,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
        token: "test-token",
        ipAddress: null,
        userAgent: null,
      },
      userId,
      em: null,
      container: null,
    }),
  );
}

describe("orchestration tRPC procedures", () => {
  test("listRuns returns empty array initially", async () => {
    const db = await freshDb("list-empty");
    try {
      const caller = createCaller(db, "org1");
      const runs = await caller.listRuns({});
      expect(runs).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("getRun returns null for missing id", async () => {
    const db = await freshDb("get-miss");
    try {
      const caller = createCaller(db, "org1");
      const run = await caller.getRun({ id: "nonexistent" });
      expect(run).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("cancelRun sets state=cancelled + emits event + fires hook", async () => {
    const db = await freshDb("cancel-proc");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const run = await createRun(db, { orgId: org.id, identifier: "c1" });

      const hookCalls: SymphonyRunRow[] = [];
      registerHook("on_cancel", (r) => { hookCalls.push(r); });

      const caller = createCaller(db, org.id);
      const cancelled = await caller.cancelRun({ id: run.id });
      expect(cancelled?.symphony_state).toBe("cancelled");

      // Event
      const events = await db.query<{ verb: string }>(
        `SELECT verb FROM events WHERE subject_kind = 'symphony_run' AND subject_id = $1`,
        [run.id],
      );
      expect(events.some((e) => e.verb === "cancelled")).toBe(true);

      // Hook
      expect(hookCalls.length).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("retryRun sets state=retry_queued and next_retry_at", async () => {
    const db = await freshDb("retry-proc");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const run = await createRun(db, { orgId: org.id, identifier: "r1" });

      const caller = createCaller(db, org.id);
      const retried = await caller.retryRun({ id: run.id });
      expect(retried?.symphony_state).toBe("retry_queued");
      expect(retried?.next_retry_at).not.toBeNull();
    } finally {
      await db.close();
    }
  });

  test("getOrchestratorStatus returns aggregated counts", async () => {
    const db = await freshDb("status-proc");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await createRun(db, { orgId: org.id, identifier: "s1" });
      const r2 = await createRun(db, { orgId: org.id, identifier: "s2" });

      const caller = createCaller(db, org.id);
      await caller.cancelRun({ id: r2.id });

      const status = await caller.getOrchestratorStatus({});
      expect(status.pending).toBe(1);
      expect(status.cancelled).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("upsertWorkflowDef + listWorkflowDefs", async () => {
    const db = await freshDb("wf-proc");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const caller = createCaller(db, org.id);

      const wf = await caller.upsertWorkflowDef({
        slug: "deploy",
        name: "Deploy",
        description: "Deploy workflow",
      });
      expect(wf.slug).toBe("deploy");

      const defs = await caller.listWorkflowDefs({});
      expect(defs.length).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("renderPromptPreview substitutes variables", async () => {
    const db = await freshDb("render-proc");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const caller = createCaller(db, org.id);

      const result = await caller.renderPromptPreview({
        template: "Deploy {{service}} to {{env}}",
        variables: { service: "api", env: "prod" },
      });
      expect(result.rendered).toBe("Deploy api to prod");
    } finally {
      await db.close();
    }
  });

  test("getSymphonyDriftReport returns empty for fresh runs", async () => {
    const db = await freshDb("drift-proc");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await createRun(db, { orgId: org.id, identifier: "d1" });

      const caller = createCaller(db, org.id);
      const drift = await caller.getSymphonyDriftReport({});
      // Fresh run is 'pending', not 'running' — not in drift report
      expect(drift).toEqual([]);
    } finally {
      await db.close();
    }
  });
});
