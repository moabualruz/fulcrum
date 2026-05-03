import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { createLocalOrg } from "../../../../product-kernel/store/repositories.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";
import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import {
  listProfiles,
  getProfile,
  upsertProfile,
  maskEnvValue,
  maskProfile,
  paginateLogs,
  listArtifacts,
  getWorkspaceDiff,
} from "./agents.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-agents-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string): Promise<{ db: ProductDb; orgId: string }> {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  return { db, orgId: org.id };
}

describe("agents server module", () => {
  test("listProfiles returns seeded profiles ordered by name", async () => {
    const { db, orgId } = await freshDb("list");
    try {
      await upsertProfile(db, { orgId, name: "codex", cliPath: "/usr/bin/codex" });
      await upsertProfile(db, { orgId, name: "claude-code", cliPath: "/usr/bin/claude" });

      const profiles = await listProfiles(db, orgId);
      expect(profiles).toHaveLength(2);
      expect(profiles[0]!.name).toBe("claude-code");
      expect(profiles[1]!.name).toBe("codex");
    } finally {
      await db.close();
    }
  });

  test("getProfile returns single profile by name", async () => {
    const { db, orgId } = await freshDb("get");
    try {
      await upsertProfile(db, { orgId, name: "claude-code", cliPath: "/usr/bin/claude" });
      const p = await getProfile(db, orgId, "claude-code");
      expect(p).toBeDefined();
      expect(p!.name).toBe("claude-code");
      expect(p!.cli_path).toBe("/usr/bin/claude");
    } finally {
      await db.close();
    }
  });

  test("getProfile returns undefined for missing profile", async () => {
    const { db, orgId } = await freshDb("get-miss");
    try {
      const p = await getProfile(db, orgId, "nope");
      expect(p).toBeUndefined();
    } finally {
      await db.close();
    }
  });

  test("upsertProfile updates existing profile on conflict", async () => {
    const { db, orgId } = await freshDb("upsert");
    try {
      await upsertProfile(db, { orgId, name: "claude-code", cliPath: "/old" });
      await upsertProfile(db, { orgId, name: "claude-code", cliPath: "/new", flags: ["--yolo"] });
      const p = await getProfile(db, orgId, "claude-code");
      expect(p!.cli_path).toBe("/new");
      expect(p!.flags).toEqual(["--yolo"]);
    } finally {
      await db.close();
    }
  });

  test("upsertProfile stores auth_env as JSON", async () => {
    const { db, orgId } = await freshDb("upsert-env");
    try {
      await upsertProfile(db, {
        orgId,
        name: "claude-code",
        cliPath: "/usr/bin/claude",
        authEnv: { ANTHROPIC_API_KEY: "sk-ant-1234abcd" },
      });
      const p = await getProfile(db, orgId, "claude-code");
      expect(p!.auth_env).toEqual({ ANTHROPIC_API_KEY: "sk-ant-1234abcd" });
    } finally {
      await db.close();
    }
  });
});

describe("maskEnvValue", () => {
  test("masks long values showing last 4 chars", () => {
    expect(maskEnvValue("sk-ant-1234abcd")).toBe("****abcd");
  });

  test("masks short values entirely", () => {
    expect(maskEnvValue("abc")).toBe("****");
    expect(maskEnvValue("abcd")).toBe("****");
  });
});

describe("maskProfile", () => {
  test("masks all auth_env values", () => {
    const profile = {
      auth_env: { KEY1: "secret12345", KEY2: "tiny" },
      name: "test",
    };
    const masked = maskProfile(profile);
    expect(masked.auth_env.KEY1).toBe("****2345");
    expect(masked.auth_env.KEY2).toBe("****");
    expect(masked.name).toBe("test");
  });
});

describe("paginateLogs", () => {
  test("paginates JSONL content with cursor", () => {
    const lines = Array.from({ length: 5 }, (_, i) =>
      JSON.stringify({ timestamp: `t${i}`, stream: "stdout", text: `line ${i}` }),
    ).join("\n");

    const page1 = paginateLogs(lines, 0, 3);
    expect(page1.entries).toHaveLength(3);
    expect(page1.entries[0]!.text).toBe("line 0");
    expect(page1.cursor).toBe(3);

    const page2 = paginateLogs(lines, 3, 3);
    expect(page2.entries).toHaveLength(2);
    expect(page2.entries[0]!.text).toBe("line 3");
    expect(page2.cursor).toBeNull();
  });

  test("handles non-JSON lines as raw", () => {
    const content = "not json\n";
    const result = paginateLogs(content, 0, 10);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.stream).toBe("raw");
    expect(result.entries[0]!.text).toBe("not json");
  });

  test("returns empty for empty content", () => {
    const result = paginateLogs("", 0, 10);
    expect(result.entries).toHaveLength(0);
    expect(result.cursor).toBeNull();
  });
});

describe("listArtifacts", () => {
  test("returns artifacts for a run", async () => {
    const { db, orgId } = await freshDb("artifacts");
    try {
      const runId = newUlid();
      await db.query(
        `INSERT INTO agent_runs (id, org_id, agent, status) VALUES ($1, $2, 'claude', 'succeeded')`,
        [runId, orgId],
      );
      const artId = newUlid();
      await db.query(
        `INSERT INTO artifacts (id, org_id, run_id, kind, title, size, mime)
         VALUES ($1, $2, $3, 'diff', 'changes.diff', 1024, 'text/x-diff')`,
        [artId, orgId, runId],
      );
      const arts = await listArtifacts(db, orgId, runId);
      expect(arts).toHaveLength(1);
      expect(arts[0]!.title).toBe("changes.diff");
      expect(arts[0]!.mime).toBe("text/x-diff");
      expect(arts[0]!.size).toBe(1024);
    } finally {
      await db.close();
    }
  });

  test("returns empty for run with no artifacts", async () => {
    const { db, orgId } = await freshDb("artifacts-empty");
    try {
      const runId = newUlid();
      await db.query(
        `INSERT INTO agent_runs (id, org_id, agent, status) VALUES ($1, $2, 'claude', 'succeeded')`,
        [runId, orgId],
      );
      const arts = await listArtifacts(db, orgId, runId);
      expect(arts).toHaveLength(0);
    } finally {
      await db.close();
    }
  });
});

describe("getWorkspaceDiff", () => {
  test("returns diff content when diff_path is set", async () => {
    const { db, orgId } = await freshDb("diff-ok");
    try {
      const diffFile = join(scratch, "test.diff");
      writeFileSync(diffFile, "--- a/foo\n+++ b/foo\n@@ -1 +1 @@\n-old\n+new\n");
      const runId = newUlid();
      await db.query(
        `INSERT INTO agent_runs (id, org_id, agent, status, diff_path) VALUES ($1, $2, 'claude', 'succeeded', $3)`,
        [runId, orgId, diffFile],
      );
      const diff = await getWorkspaceDiff(db, orgId, runId);
      expect(diff).toContain("+new");
    } finally {
      await db.close();
    }
  });

  test("returns null when diff_path is null", async () => {
    const { db, orgId } = await freshDb("diff-null");
    try {
      const runId = newUlid();
      await db.query(
        `INSERT INTO agent_runs (id, org_id, agent, status) VALUES ($1, $2, 'claude', 'succeeded')`,
        [runId, orgId],
      );
      const diff = await getWorkspaceDiff(db, orgId, runId);
      expect(diff).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("returns null when diff file does not exist", async () => {
    const { db, orgId } = await freshDb("diff-missing");
    try {
      const runId = newUlid();
      await db.query(
        `INSERT INTO agent_runs (id, org_id, agent, status, diff_path) VALUES ($1, $2, 'claude', 'succeeded', '/nonexistent/path.diff')`,
        [runId, orgId],
      );
      const diff = await getWorkspaceDiff(db, orgId, runId);
      expect(diff).toBeNull();
    } finally {
      await db.close();
    }
  });
});
