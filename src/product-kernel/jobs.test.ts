import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../test-support/product-fixtures.ts";
import { createLocalOrg } from "../test-support/product-fixtures.ts";
import {
  cancelJob,
  claimJob,
  completeJob,
  enqueueJob,
  failJob,
  getJob,
} from "./jobs.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-jobs-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  return db;
}

describe("jobs queue", () => {
  test("claimJob does not return the same job twice and respects FIFO", async () => {
    const db = await freshDb("claim");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      // Stagger availableAt so the FIFO ordering is unambiguous regardless of
      // PGlite clock resolution. claimJob orders by available_at, created_at,
      // id; passing distinct availableAt timestamps gives a deterministic
      // ground truth without depending on insert-time millisecond skew.
      const t0 = Date.now();
      const a = await enqueueJob(db, {
        orgId: org.id, queue: "default", kind: "test",
        availableAt: new Date(t0 - 3000),
      });
      const b = await enqueueJob(db, {
        orgId: org.id, queue: "default", kind: "test",
        availableAt: new Date(t0 - 2000),
      });
      const c = await enqueueJob(db, {
        orgId: org.id, queue: "default", kind: "test",
        availableAt: new Date(t0 - 1000),
      });

      const first = await claimJob(db, "default", "worker-1");
      const second = await claimJob(db, "default", "worker-1");
      const third = await claimJob(db, "default", "worker-1");
      const fourth = await claimJob(db, "default", "worker-1");

      expect(first?.id).toBe(a.id);
      expect(second?.id).toBe(b.id);
      expect(third?.id).toBe(c.id);
      expect(fourth).toBeNull();

      expect(first?.status).toBe("running");
      expect(first?.locked_by).toBe("worker-1");
      expect(first?.attempts).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("completeJob marks status succeeded and clears lock fields", async () => {
    const db = await freshDb("complete");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const job = await enqueueJob(db, { orgId: org.id, queue: "q", kind: "k" });
      await claimJob(db, "q", "w");
      await completeJob(db, job.id);
      const row = await getJob(db, job.id);
      expect(row?.status).toBe("succeeded");
      expect(row?.locked_by).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("failJob requeues until max_attempts then marks failed", async () => {
    const db = await freshDb("fail");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const job = await enqueueJob(db, {
        orgId: org.id,
        queue: "q",
        kind: "k",
        maxAttempts: 2,
      });

      await claimJob(db, "q", "w");
      const afterFirstFail = await failJob(db, job.id, "boom-1");
      expect(afterFirstFail?.status).toBe("queued");
      expect(afterFirstFail?.attempts).toBe(1);

      await claimJob(db, "q", "w");
      const afterSecondFail = await failJob(db, job.id, "boom-2");
      expect(afterSecondFail?.status).toBe("failed");
      expect(afterSecondFail?.attempts).toBe(2);
      expect(afterSecondFail?.last_error).toBe("boom-2");
    } finally {
      await db.close();
    }
  });

  test("cancelJob marks status cancelled", async () => {
    const db = await freshDb("cancel");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const job = await enqueueJob(db, { orgId: org.id, queue: "q", kind: "k" });
      await cancelJob(db, job.id);
      const row = await getJob(db, job.id);
      expect(row?.status).toBe("cancelled");
    } finally {
      await db.close();
    }
  });
});
