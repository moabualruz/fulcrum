import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg } from "@test-support/product-workspace-fixtures.ts";

let scratch: string;
let db: Awaited<ReturnType<typeof openIsolatedStore>>;
let orgId: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

/**
 * The orchestration route reaches its database through `requestServiceScope`
 * (`requestAppScope`). When `locals.em` is supplied it is used directly; with
 * an explicit `orgId`, scope resolution short-circuits and never needs a
 * TypeORM `EntityManager` — the route's orchestration queries only require a
 * `{ query }` SQL executor, which the isolated store provides.
 *
 * The store is migrated with the raw-SQL `productStoreMigrations` set, which
 * is what actually creates `workflow_defs` + `orchestration_config`. Those two
 * tables are NOT present in the canonical TypeORM `application-database`
 * schema (which only ships the differently named `workflow_definitions`), so
 * the route cannot persist against a TypeORM-migrated database. See the
 * PRODUCT BUG note in the W6 baseline-test repair report.
 */
function routeLocals() {
  return { em: db, orgId, activeProjectId: null };
}

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-orch-settings-"));
  process.env["FULCRUM_HOME"] = scratch;
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  orgId = org.id;
});

afterEach(async () => {
  await db.close();
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

describe("/settings/orchestration +page.server.ts", () => {
  test("load returns default config when none exists", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      locals: routeLocals(),
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ config: { poll_interval_s: number }; workflows: unknown[] }>(result);
    expect(payload.config.poll_interval_s).toBe(5);
    expect(payload.workflows).toEqual([]);
  });

  test("save action creates config", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const formData = new FormData();
    formData.set("poll_interval_s", "10");
    formData.set("max_concurrency", "8");
    formData.set("stall_timeout_s", "600");
    formData.set("workspace_root", "/ws");
    const request = new Request("http://localhost/settings/orchestration?/save", {
      method: "POST",
      body: formData,
    });
    const result = await mod.actions.save({
      request,
      locals: routeLocals(),
    } as Parameters<typeof mod.actions.save>[0]);
    expect(result).toBeDefined();
    // A success result is not a SvelteKit `fail()` envelope (no 4xx status).
    const hasFailStatus = typeof result === "object" && result !== null && "status" in result;
    expect(hasFailStatus).toBe(false);

    // The config row was persisted with the submitted values.
    const rows = await db.query<{ poll_interval_s: number; max_concurrency: number }>(
      "SELECT * FROM orchestration_config WHERE org_id = $1",
      [orgId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.poll_interval_s).toBe(10);
    expect(rows[0]?.max_concurrency).toBe(8);
  });

  test("save action rejects invalid poll interval", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const formData = new FormData();
    formData.set("poll_interval_s", "0");
    formData.set("max_concurrency", "4");
    formData.set("stall_timeout_s", "300");
    const request = new Request("http://localhost/settings/orchestration?/save", {
      method: "POST",
      body: formData,
    });
    const result = await mod.actions.save({
      request,
      locals: routeLocals(),
    } as Parameters<typeof mod.actions.save>[0]);
    expect(result).toBeDefined();
    expect(
      typeof result === "object" && result !== null && "status" in result
        && (result as { status: number }).status === 400,
    ).toBe(true);
  });
});
