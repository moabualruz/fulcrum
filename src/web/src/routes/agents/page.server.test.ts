import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { createLocalOrg } from "../../../../product-kernel/store/repositories.ts";
import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import { upsertProfile } from "../../lib/server/agents.ts";

let scratch: string;

interface ProfilesPayload {
  profiles: Array<{
    id: string;
    name: string;
    cli_path: string;
    auth_env: Record<string, string>;
    test_passed: boolean | null;
  }>;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-agents-page-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedProfiles(): Promise<void> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  await upsertProfile(db, {
    orgId: org.id,
    name: "claude-code",
    cliPath: "/usr/bin/claude",
    authEnv: { ANTHROPIC_API_KEY: "sk-ant-secret1234" },
  });
  await upsertProfile(db, {
    orgId: org.id,
    name: "codex",
    cliPath: "/usr/bin/codex",
  });
  await db.close();
}

describe("/agents +page.server.ts", () => {
  test("load returns seeded profiles with masked auth_env", async () => {
    await seedProfiles();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ProfilesPayload>(result);
    expect(payload.profiles).toHaveLength(2);
    // Ordered by name ASC
    expect(payload.profiles[0]!.name).toBe("claude-code");
    expect(payload.profiles[1]!.name).toBe("codex");
    // Auth env must be masked
    expect(payload.profiles[0]!.auth_env.ANTHROPIC_API_KEY).toBe("****1234");
  });

  test("load returns empty array when no profiles", async () => {
    const dbDir = join(scratch, "state", "product", "db");
    mkdirSync(dbDir, { recursive: true });
    const db = await openPglite(join(dbDir, "main"));
    await runMigrations(db);
    await createLocalOrg(db, { slug: "default", name: "Default" });
    await db.close();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ProfilesPayload>(result);
    expect(payload.profiles).toEqual([]);
  });
});
