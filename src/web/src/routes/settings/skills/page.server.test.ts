import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../../test-support/product-fixtures.ts";
import { createLocalOrg } from "../../../../../test-support/product-fixtures.ts";
import { installSkill } from "../../../lib/server/skills.ts";

let scratch: string;

interface SkillsPayload {
  skills: Array<{
    id: string;
    slug: string;
    version: string;
    source: string;
    enabled_agents: string[];
  }>;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-skills-page-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedSkills(): Promise<void> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  await installSkill(db, { orgId: org.id, slug: "jq" });
  await installSkill(db, { orgId: org.id, slug: "bat", upstreamRepo: "https://github.com/ex/bat" });
  await db.close();
}

async function seedEmpty(): Promise<void> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  await createLocalOrg(db, { slug: "default", name: "Default" });
  await db.close();
}

describe("/settings/skills +page.server.ts load()", () => {
  test("returns seeded skills sorted by slug ASC", async () => {
    await seedSkills();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = mod.load({} as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<SkillsPayload>(result);
    expect(Array.isArray(payload.skills)).toBe(true);
    expect(payload.skills).toHaveLength(2);
    expect(payload.skills[0]!.slug).toBe("bat");
    expect(payload.skills[1]!.slug).toBe("jq");
  });

  test("returns empty array when no skills installed", async () => {
    await seedEmpty();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = mod.load({} as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<SkillsPayload>(result);
    expect(payload.skills).toEqual([]);
  });
});
