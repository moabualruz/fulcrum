import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { createLocalOrg } from "../../../../product-kernel/store/repositories.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";
import type { OrchestrationDashboardData } from "$lib/server/orchestration";

let scratch: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-orch-dash-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedDb() {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  return { db, orgId: org.id };
}

describe("/orchestration +page.server.ts load()", () => {
  test("returns dashboard data for empty DB", async () => {
    const { db } = await seedDb();
    await db.close();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<OrchestrationDashboardData>(result);
    expect(payload.status.concurrencyUsed).toBe(0);
    expect(payload.status.concurrencyMax).toBe(4);
    expect(payload.dispatches).toEqual([]);
    expect(payload.retryQueue).toEqual([]);
  });

  test("returns dispatches with seeded runs", async () => {
    const { db, orgId } = await seedDb();
    const id = newUlid();
    await db.query(
      `INSERT INTO agent_runs (id, org_id, agent, status, symphony_state)
       VALUES ($1, $2, 'claude', 'running', 'dispatched')`,
      [id, orgId],
    );
    await db.close();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<OrchestrationDashboardData>(result);
    expect(payload.dispatches).toHaveLength(1);
    expect(payload.dispatches[0]?.agent).toBe("claude");
    expect(payload.status.concurrencyUsed).toBe(1);
    expect(payload.status.workerConnected).toBe(true);
  });
});
