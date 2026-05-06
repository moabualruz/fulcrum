import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import { createLocalOrg } from "../../../../test-support/product-fixtures.ts";
import type { TestStore } from "../../../../test-support/product-fixtures.ts";
import {
  listSkills,
  installSkill,
  upgradeSkill,
  upgradeAllSkills,
  uninstallSkill,
  updateEnabledAgents,
  resolveConflict,
} from "./skills.ts";

let scratch: string;
let db: TestStore;
let orgId: string;

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-skills-test-"));
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  orgId = org.id;
});

afterEach(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("skills service", () => {
  test("listSkills returns empty array when no skills installed", async () => {
    const result = await listSkills(db, orgId);
    expect(result).toEqual([]);
  });

  test("installSkill creates a local skill when no upstream_repo", async () => {
    const skill = await installSkill(db, { orgId, slug: "jq" });
    expect(skill.slug).toBe("jq");
    expect(skill.source).toBe("local");
    expect(skill.version).toBe("0.0.0");
    expect(skill.upstream_repo).toBeNull();
    expect(skill.enabled_agents).toEqual([]);
    expect(skill.upstream_conflict).toBeNull();
  });

  test("installSkill creates an upstream skill when upstream_repo given", async () => {
    const skill = await installSkill(db, {
      orgId,
      slug: "bat",
      upstreamRepo: "https://github.com/example/bat-skill",
    });
    expect(skill.source).toBe("upstream");
    expect(skill.upstream_repo).toBe("https://github.com/example/bat-skill");
  });

  test("installSkill rejects empty slug", async () => {
    await expect(installSkill(db, { orgId, slug: "" })).rejects.toThrow("slug is required");
    await expect(installSkill(db, { orgId, slug: "   " })).rejects.toThrow("slug is required");
  });

  test("installSkill rejects duplicate slug", async () => {
    await installSkill(db, { orgId, slug: "dup" });
    await expect(installSkill(db, { orgId, slug: "dup" })).rejects.toThrow();
  });

  test("installed skill appears in listSkills", async () => {
    await installSkill(db, { orgId, slug: "alpha" });
    await installSkill(db, { orgId, slug: "beta" });
    const list = await listSkills(db, orgId);
    expect(list).toHaveLength(2);
    expect(list[0]!.slug).toBe("alpha");
    expect(list[1]!.slug).toBe("beta");
  });

  test("upgradeSkill bumps version patch", async () => {
    await installSkill(db, { orgId, slug: "jq" });
    const upgraded = await upgradeSkill(db, orgId, "jq");
    expect(upgraded.version).toBe("0.0.1");
    const again = await upgradeSkill(db, orgId, "jq");
    expect(again.version).toBe("0.0.2");
  });

  test("upgradeSkill throws for unknown slug", async () => {
    await expect(upgradeSkill(db, orgId, "nonexistent")).rejects.toThrow("not found");
  });

  test("upgradeAllSkills upgrades every installed skill", async () => {
    await installSkill(db, { orgId, slug: "a" });
    await installSkill(db, { orgId, slug: "b" });
    const results = await upgradeAllSkills(db, orgId);
    expect(results).toHaveLength(2);
    expect(results.every((s) => s.version === "0.0.1")).toBe(true);
  });

  test("uninstallSkill removes the row", async () => {
    await installSkill(db, { orgId, slug: "jq" });
    await uninstallSkill(db, orgId, "jq");
    const list = await listSkills(db, orgId);
    expect(list).toHaveLength(0);
  });

  test("uninstallSkill throws for unknown slug", async () => {
    await expect(uninstallSkill(db, orgId, "nope")).rejects.toThrow("not found");
  });

  test("updateEnabledAgents persists agent list", async () => {
    await installSkill(db, { orgId, slug: "jq" });
    const updated = await updateEnabledAgents(db, orgId, "jq", ["claude", "codex"]);
    expect(updated.enabled_agents).toEqual(["claude", "codex"]);
    // Verify persisted
    const list = await listSkills(db, orgId);
    expect(list[0]!.enabled_agents).toEqual(["claude", "codex"]);
  });

  test("resolveConflict clears conflict with keep_local", async () => {
    await installSkill(db, { orgId, slug: "jq" });
    // Inject a conflict directly
    await db.query(
      `UPDATE skills SET upstream_conflict = $1::jsonb WHERE org_id = $2 AND slug = $3`,
      [
        JSON.stringify({ local_content: "local v", upstream_content: "upstream v" }),
        orgId,
        "jq",
      ],
    );
    const resolved = await resolveConflict(db, { orgId, slug: "jq", resolution: "keep_local" });
    expect(resolved.upstream_conflict).toBeNull();
  });

  test("resolveConflict clears conflict with use_upstream", async () => {
    await installSkill(db, { orgId, slug: "jq" });
    await db.query(
      `UPDATE skills SET upstream_conflict = $1::jsonb WHERE org_id = $2 AND slug = $3`,
      [
        JSON.stringify({ local_content: "old", upstream_content: "new" }),
        orgId,
        "jq",
      ],
    );
    const resolved = await resolveConflict(db, { orgId, slug: "jq", resolution: "use_upstream" });
    expect(resolved.upstream_conflict).toBeNull();
    expect(resolved.content_hash).toContain("upstream-");
  });

  test("resolveConflict throws when no conflict exists", async () => {
    await installSkill(db, { orgId, slug: "jq" });
    await expect(
      resolveConflict(db, { orgId, slug: "jq", resolution: "keep_local" }),
    ).rejects.toThrow("no conflict");
  });

  test("full lifecycle: install → list → upgrade → conflict → resolve → uninstall", async () => {
    const skill = await installSkill(db, { orgId, slug: "lifecycle" });
    expect(skill.version).toBe("0.0.0");

    let list = await listSkills(db, orgId);
    expect(list).toHaveLength(1);

    const upgraded = await upgradeSkill(db, orgId, "lifecycle");
    expect(upgraded.version).toBe("0.0.1");

    // Inject conflict
    await db.query(
      `UPDATE skills SET upstream_conflict = $1::jsonb WHERE org_id = $2 AND slug = $3`,
      [JSON.stringify({ local_content: "A", upstream_content: "B" }), orgId, "lifecycle"],
    );
    list = await listSkills(db, orgId);
    expect(list[0]!.upstream_conflict).not.toBeNull();

    const resolved = await resolveConflict(db, { orgId, slug: "lifecycle", resolution: "use_upstream" });
    expect(resolved.upstream_conflict).toBeNull();

    await uninstallSkill(db, orgId, "lifecycle");
    list = await listSkills(db, orgId);
    expect(list).toHaveLength(0);
  });
});
