import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@/test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "@/test-support/product-fixtures.ts";
import {
  createLocalOrg,
  type EventRow,
} from "@/test-support/product-fixtures.ts";
import type { TestStore } from "@/test-support/product-fixtures.ts";
import {
  listProfiles,
  testProfileAction,
  upsertProfileAction,
  type AgentProfileRow,
} from "./agents.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-agents-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string): Promise<{
  db: TestStore;
  orgId: string;
}> {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  return { db, orgId: org.id };
}

async function seedProfiles(
  db: TestStore,
  orgId: string,
  count: number,
): Promise<string[]> {
  const ids: string[] = [];
  const agents = ["claude-code", "codex", "gemini", "opencode", "pi", "custom"];
  for (let i = 0; i < count; i++) {
    const name = agents[i] ?? `agent-${i}`;
    const { id } = await upsertProfileAction(db, orgId, {
      name,
      cliPath: `/usr/local/bin/${name}`,
      defaultFlags: "",
      authEnvVars: [],
    });
    ids.push(id);
  }
  return ids;
}

describe("server actions: agents", () => {
  test("listProfiles returns all seeded profiles", async () => {
    const { db, orgId } = await freshDb("list-profiles");
    try {
      await seedProfiles(db, orgId, 6);
      const profiles = await listProfiles(db, orgId);
      expect(profiles).toHaveLength(6);
      expect(profiles.map((p) => p.name).sort()).toEqual([
        "claude-code",
        "codex",
        "custom",
        "gemini",
        "opencode",
        "pi",
      ]);
    } finally {
      await db.close();
    }
  });

  test("upsertProfileAction creates a new profile", async () => {
    const { db, orgId } = await freshDb("upsert-create");
    try {
      const result = await upsertProfileAction(db, orgId, {
        name: "claude-code",
        cliPath: "/usr/local/bin/claude",
        defaultFlags: "--verbose",
        authEnvVars: ["ANTHROPIC_API_KEY"],
      });
      expect(result.id).toBeTruthy();

      const profiles = await listProfiles(db, orgId);
      expect(profiles).toHaveLength(1);
      expect(profiles[0]!.name).toBe("claude-code");
      expect(profiles[0]!.cli_path).toBe("/usr/local/bin/claude");
      expect(profiles[0]!.default_flags).toBe("--verbose");
      expect(profiles[0]!.auth_env_vars).toEqual(["ANTHROPIC_API_KEY"]);
    } finally {
      await db.close();
    }
  });

  test("upsertProfileAction updates existing profile by name", async () => {
    const { db, orgId } = await freshDb("upsert-update");
    try {
      await upsertProfileAction(db, orgId, {
        name: "codex",
        cliPath: "/old/codex",
        defaultFlags: "",
        authEnvVars: [],
      });
      await upsertProfileAction(db, orgId, {
        name: "codex",
        cliPath: "/new/codex",
        defaultFlags: "--model gpt-5",
        authEnvVars: ["OPENAI_API_KEY"],
      });

      const profiles = await listProfiles(db, orgId);
      expect(profiles).toHaveLength(1);
      expect(profiles[0]!.cli_path).toBe("/new/codex");
      expect(profiles[0]!.default_flags).toBe("--model gpt-5");
    } finally {
      await db.close();
    }
  });

  test("testProfileAction sets test_passed and last_tested_at", async () => {
    const { db, orgId } = await freshDb("test-profile");
    try {
      const [id] = await seedProfiles(db, orgId, 1);
      const result = await testProfileAction(db, id!, orgId, true);
      expect(result.ok).toBe(true);

      const profiles = await listProfiles(db, orgId);
      expect(profiles[0]!.test_passed).toBe(true);
      expect(profiles[0]!.last_tested_at).not.toBeNull();
    } finally {
      await db.close();
    }
  });

  test("testProfileAction emits agent_profile.tested event", async () => {
    const { db, orgId } = await freshDb("test-event");
    try {
      const [id] = await seedProfiles(db, orgId, 1);
      await testProfileAction(db, id!, orgId, false);

      const events = await db.query<EventRow>(
        `SELECT * FROM events WHERE subject_id = $1`,
        [id!],
      );
      const tested = events.find((e) => e.verb === "tested");
      expect(tested?.subject_kind).toBe("agent_profile");
      expect(tested?.payload).toEqual({ test_passed: false });
    } finally {
      await db.close();
    }
  });
});
