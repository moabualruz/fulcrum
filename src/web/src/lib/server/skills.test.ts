import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { SkillConflict, SkillConflictKind, SkillConflictStatus } from "../../../../db/entities/skills/SkillConflict.ts";
import { createTestOrm, type TestOrm } from "../../../../test-utils/db.ts";
import {
  installSkill,
  listSkills,
  resolveConflict,
  uninstallSkill,
  updateEnabledAgents,
  upgradeAllSkills,
  upgradeSkill,
  type SkillsWebScope,
} from "./skills.ts";

let db: TestOrm;
let scope: SkillsWebScope;

beforeEach(async () => {
  db = await createTestOrm();
  scope = { em: db.em.fork(), ctx: { orgId: db.seed.orgId } };
});

afterEach(async () => {
  await db.close();
});

async function addConflict(slug: string): Promise<void> {
  const em = db.em.fork();
  em.persist(em.create(SkillConflict, {
    slug,
    kind: SkillConflictKind.UpstreamConflict,
    status: SkillConflictStatus.Open,
    localHash: "local v",
    upstreamHash: "upstream v",
  }));
  await em.flush();
}

describe("skills service", () => {
  test("web skills facade delegates to application modules without direct data access", () => {
    const source = readFileSync(join(import.meta.dir, "skills.ts"), "utf8");
    expect(source).toContain("application/skills");
    expect(source).not.toMatch(/EntityManager|sqlAccess|getKysely|SELECT|INSERT|UPDATE|DELETE|\.execute\(/);
  });

  test("listSkills returns empty array when no skills installed", async () => {
    expect(await listSkills(scope)).toEqual([]);
  });

  test("installSkill creates local and upstream skills", async () => {
    const local = await installSkill(scope, { slug: "jq" });
    expect(local.slug).toBe("jq");
    expect(local.source).toBe("local");
    expect(local.version).toBe("0.0.0");
    expect(local.upstream_repo).toBeNull();
    expect(local.enabled_agents).toEqual([]);
    expect(local.upstream_conflict).toBeNull();

    const upstream = await installSkill(scope, {
      slug: "bat",
      upstreamRepo: "https://github.com/example/bat-skill",
    });
    expect(upstream.source).toBe("upstream");
    expect(upstream.upstream_repo).toBe("https://github.com/example/bat-skill");
  });

  test("installSkill rejects empty and duplicate slugs", async () => {
    await expect(installSkill(scope, { slug: "" })).rejects.toThrow("slug is required");
    await expect(installSkill(scope, { slug: "   " })).rejects.toThrow("slug is required");
    await installSkill(scope, { slug: "dup" });
    await expect(installSkill(scope, { slug: "dup" })).rejects.toThrow();
  });

  test("listSkills sorts installed skills by slug", async () => {
    await installSkill(scope, { slug: "beta" });
    await installSkill(scope, { slug: "alpha" });
    const list = await listSkills(scope);
    expect(list.map((skill) => skill.slug)).toEqual(["alpha", "beta"]);
  });

  test("upgradeSkill bumps version patch", async () => {
    await installSkill(scope, { slug: "jq" });
    expect((await upgradeSkill(scope, "jq")).version).toBe("0.0.1");
    expect((await upgradeSkill(scope, "jq")).version).toBe("0.0.2");
  });

  test("upgradeSkill throws for unknown slug", async () => {
    await expect(upgradeSkill(scope, "nonexistent")).rejects.toThrow("not found");
  });

  test("upgradeAllSkills upgrades every installed skill", async () => {
    await installSkill(scope, { slug: "a" });
    await installSkill(scope, { slug: "b" });
    const results = await upgradeAllSkills(scope);
    expect(results).toHaveLength(2);
    expect(results.every((skill) => skill.version === "0.0.1")).toBe(true);
  });

  test("uninstallSkill removes the row and throws for unknown slug", async () => {
    await installSkill(scope, { slug: "jq" });
    await uninstallSkill(scope, "jq");
    expect(await listSkills(scope)).toHaveLength(0);
    await expect(uninstallSkill(scope, "nope")).rejects.toThrow("not found");
  });

  test("updateEnabledAgents persists agent list", async () => {
    await installSkill(scope, { slug: "jq" });
    const updated = await updateEnabledAgents(scope, "jq", ["claude", "codex"]);
    expect(updated.enabled_agents).toEqual(["claude", "codex"]);
    expect((await listSkills(scope))[0]!.enabled_agents).toEqual(["claude", "codex"]);
  });

  test("resolveConflict clears open conflict", async () => {
    await installSkill(scope, { slug: "jq" });
    await addConflict("jq");
    expect((await listSkills(scope))[0]!.upstream_conflict).toEqual({
      local_content: "local v",
      upstream_content: "upstream v",
    });
    const resolved = await resolveConflict(scope, { slug: "jq", resolution: "use_upstream" });
    expect(resolved.upstream_conflict).toBeNull();
  });

  test("resolveConflict throws when no conflict exists", async () => {
    await installSkill(scope, { slug: "jq" });
    await expect(resolveConflict(scope, { slug: "jq", resolution: "keep_local" })).rejects.toThrow("no conflict");
  });
});
