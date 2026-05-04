import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { openPglite } from "./db/pglite.ts";
import { runMigrations } from "./db/migrate.ts";
import { createLocalOrg } from "./store/repositories.ts";
import {
  cancelRun,
  clearHooks,
  createRun,
  getOrchestratorStatus,
  getRun,
  listRuns,
  listWorkflowDefs,
  registerHook,
  renderPromptPreview,
  retryRun,
  upsertWorkflowDef,
  type SymphonyRunRow,
} from "./symphony.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-symphony-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

afterEach(() => {
  clearHooks();
});

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  return db;
}

describe("symphony runs", () => {
  test("createRun + getRun round-trip", async () => {
    const db = await freshDb("create");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const run = await createRun(db, {
        orgId: org.id,
        identifier: "test-run-1",
        payload: { foo: "bar" },
      });
      expect(run.symphony_state).toBe("pending");
      expect(run.identifier).toBe("test-run-1");

      const fetched = await getRun(db, run.id);
      expect(fetched?.id).toBe(run.id);
    } finally {
      await db.close();
    }
  });

  test("listRuns returns runs for org", async () => {
    const db = await freshDb("list");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await createRun(db, { orgId: org.id, identifier: "r1" });
      await createRun(db, { orgId: org.id, identifier: "r2" });
      const runs = await listRuns(db, org.id);
      expect(runs.length).toBe(2);
    } finally {
      await db.close();
    }
  });

  test("cancelRun sets state=cancelled, emits event, fires on_cancel hook", async () => {
    const db = await freshDb("cancel");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const run = await createRun(db, { orgId: org.id, identifier: "c1" });

      const hookCalls: SymphonyRunRow[] = [];
      registerHook("on_cancel", (r) => { hookCalls.push(r); });

      const cancelled = await cancelRun(db, run.id);
      expect(cancelled?.symphony_state).toBe("cancelled");

      // Event emitted
      const events = await db.query<{ verb: string }>(
        `SELECT verb FROM events WHERE subject_kind = 'symphony_run' AND subject_id = $1`,
        [run.id],
      );
      expect(events.some((e) => e.verb === "cancelled")).toBe(true);

      // Hook fired
      expect(hookCalls.length).toBe(1);
      expect(hookCalls[0]!.id).toBe(run.id);
    } finally {
      await db.close();
    }
  });

  test("retryRun sets state=retry_queued and next_retry_at=NOW()", async () => {
    const db = await freshDb("retry");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const run = await createRun(db, { orgId: org.id, identifier: "r1" });

      const retried = await retryRun(db, run.id);
      expect(retried?.symphony_state).toBe("retry_queued");
      expect(retried?.next_retry_at).not.toBeNull();

      // Event emitted
      const events = await db.query<{ verb: string }>(
        `SELECT verb FROM events WHERE subject_kind = 'symphony_run' AND subject_id = $1`,
        [run.id],
      );
      expect(events.some((e) => e.verb === "retry_queued")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("getOrchestratorStatus aggregates correctly", async () => {
    const db = await freshDb("status");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await createRun(db, { orgId: org.id, identifier: "s1" });
      await createRun(db, { orgId: org.id, identifier: "s2" });
      const r3 = await createRun(db, { orgId: org.id, identifier: "s3" });
      await cancelRun(db, r3.id);

      const status = await getOrchestratorStatus(db, org.id);
      expect(status.pending).toBe(2);
      expect(status.cancelled).toBe(1);
      expect(status.running).toBe(0);
    } finally {
      await db.close();
    }
  });
});

describe("workflow definitions", () => {
  test("upsertWorkflowDef creates and updates", async () => {
    const db = await freshDb("wf-upsert");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const wf = await upsertWorkflowDef(db, {
        orgId: org.id,
        slug: "deploy",
        name: "Deploy",
        description: "Run deploy",
      });
      expect(wf.slug).toBe("deploy");
      expect(wf.name).toBe("Deploy");

      // Upsert updates
      const wf2 = await upsertWorkflowDef(db, {
        orgId: org.id,
        slug: "deploy",
        name: "Deploy v2",
        description: "Updated",
      });
      expect(wf2.id).toBe(wf.id);
      expect(wf2.name).toBe("Deploy v2");
    } finally {
      await db.close();
    }
  });

  test("listWorkflowDefs returns org defs", async () => {
    const db = await freshDb("wf-list");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await upsertWorkflowDef(db, { orgId: org.id, slug: "a", name: "A" });
      await upsertWorkflowDef(db, { orgId: org.id, slug: "b", name: "B" });
      const defs = await listWorkflowDefs(db, org.id);
      expect(defs.length).toBe(2);
    } finally {
      await db.close();
    }
  });
});

describe("renderPromptPreview", () => {
  test("replaces variables, leaves unknown untouched", () => {
    const result = renderPromptPreview(
      "Hello {{name}}, deploy {{service}} to {{env}}",
      { name: "Alice", service: "api" },
    );
    expect(result).toBe("Hello Alice, deploy api to {{env}}");
  });
});
