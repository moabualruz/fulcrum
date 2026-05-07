import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@/test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "@/test-support/product-fixtures.ts";
import { createLocalOrg } from "@/test-support/product-fixtures.ts";

let scratch: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-orch-settings-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedDb() {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  return { db, orgId: org.id };
}

describe("/settings/orchestration +page.server.ts", () => {
  test("load returns default config when none exists", async () => {
    const { db } = await seedDb();
    await db.close();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ config: { poll_interval_s: number }; workflows: unknown[] }>(result);
    expect(payload.config.poll_interval_s).toBe(5);
    expect(payload.workflows).toEqual([]);
  });

  test("save action creates config", async () => {
    const { db } = await seedDb();
    await db.close();
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
    const result = await mod.actions.save({ request } as Parameters<typeof mod.actions.save>[0]);
    expect(result).toBeDefined();
  });

  test("save action rejects invalid poll interval", async () => {
    const { db } = await seedDb();
    await db.close();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const formData = new FormData();
    formData.set("poll_interval_s", "0");
    formData.set("max_concurrency", "4");
    formData.set("stall_timeout_s", "300");
    const request = new Request("http://localhost/settings/orchestration?/save", {
      method: "POST",
      body: formData,
    });
    const result = await mod.actions.save({ request } as Parameters<typeof mod.actions.save>[0]);
    expect(result).toBeDefined();
    expect(
      typeof result === "object" && result !== null && "status" in result
        && (result as { status: number }).status === 400,
    ).toBe(true);
  });
});
