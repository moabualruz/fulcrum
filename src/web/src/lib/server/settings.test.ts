import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { createLocalOrg, createProject } from "../../../../product-kernel/store/repositories.ts";
import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import {
  getSettingsScreens,
  getSettingsGroups,
  getBreadcrumb,
  routingRulesListAction,
  routingRuleCreateAction,
  routingRuleUpdateAction,
  routingRuleDeleteAction,
  featureFlagsListAction,
  featureFlagSetAction,
  customFieldsListAction,
  customFieldCreateAction,
  customFieldDeleteAction,
  customFieldReorderAction,
  savedViewsListAction,
  savedViewCreateAction,
  savedViewUpdateAction,
  savedViewDeleteAction,
  membersListAction,
  memberAddAction,
  memberRoleUpdateAction,
  invitationsListAction,
  invitationCreateAction,
} from "./settings.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-settings-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function freshDb(name: string): Promise<{ db: ProductDb; orgId: string }> {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  return { db, orgId: org.id };
}

// --- Settings Navigator ---

describe("settings navigator", () => {
  test("lists 15 settings screens", () => {
    const screens = getSettingsScreens();
    expect(screens).toHaveLength(15);
    expect(screens.map((s) => s.key)).toContain("routing-rules");
    expect(screens.map((s) => s.key)).toContain("feature-flags");
    expect(screens.map((s) => s.key)).toContain("auth");
  });

  test("groups screens by group", () => {
    const groups = getSettingsGroups();
    expect(groups.has("Agent")).toBe(true);
    expect(groups.has("General")).toBe(true);
    expect(groups.has("Organization")).toBe(true);
    expect(groups.get("Agent")!.map((s) => s.key)).toContain("routing-rules");
  });

  test("breadcrumb returns path for known key", () => {
    expect(getBreadcrumb("routing-rules")).toEqual(["Settings", "Agent", "Routing Rules"]);
    expect(getBreadcrumb("feature-flags")).toEqual(["Settings", "General", "Feature Flags"]);
  });

  test("breadcrumb returns fallback for unknown key", () => {
    expect(getBreadcrumb("nonexistent")).toEqual(["Settings"]);
  });
});

// --- Routing Rules ---

describe("routing rules", () => {
  test("CRUD lifecycle", async () => {
    const { db, orgId } = await freshDb("routing-rules");
    try {
      // create
      const rule = await routingRuleCreateAction(db, {
        orgId,
        ruleJson: { match: "*.ts", agent: "claude" },
        priority: 10,
      });
      expect(rule.id).toBeTruthy();
      expect(rule.priority).toBe(10);

      // list
      const rules = await routingRulesListAction(db, orgId);
      expect(rules).toHaveLength(1);
      expect(rules[0]!.id).toBe(rule.id);

      // update
      const updated = await routingRuleUpdateAction(db, rule.id, orgId, {
        ruleJson: { match: "*.py", agent: "codex" },
        priority: 20,
      });
      expect(updated.priority).toBe(20);

      // delete
      const deleted = await routingRuleDeleteAction(db, rule.id, orgId);
      expect(deleted).toBe(true);

      const after = await routingRulesListAction(db, orgId);
      expect(after).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  test("list ordered by priority DESC", async () => {
    const { db, orgId } = await freshDb("routing-rules-order");
    try {
      await routingRuleCreateAction(db, { orgId, ruleJson: { a: 1 }, priority: 1 });
      await routingRuleCreateAction(db, { orgId, ruleJson: { b: 2 }, priority: 10 });
      await routingRuleCreateAction(db, { orgId, ruleJson: { c: 3 }, priority: 5 });

      const rules = await routingRulesListAction(db, orgId);
      expect(rules.map((r) => r.priority)).toEqual([10, 5, 1]);
    } finally {
      await db.close();
    }
  });
});

// --- Feature Flags ---

describe("feature flags", () => {
  test("set and toggle", async () => {
    const { db, orgId } = await freshDb("feature-flags");
    try {
      // set on
      const flag = await featureFlagSetAction(db, orgId, "dark-mode", true);
      expect(flag.key).toBe("dark-mode");
      expect(flag.enabled).toBe(true);

      // toggle off (upsert)
      const toggled = await featureFlagSetAction(db, orgId, "dark-mode", false);
      expect(toggled.key).toBe("dark-mode");
      expect(toggled.enabled).toBe(false);

      // list
      const flags = await featureFlagsListAction(db, orgId);
      expect(flags).toHaveLength(1);
      expect(flags[0]!.enabled).toBe(false);
    } finally {
      await db.close();
    }
  });

  test("multiple flags sorted by key", async () => {
    const { db, orgId } = await freshDb("feature-flags-multi");
    try {
      await featureFlagSetAction(db, orgId, "z-flag", true);
      await featureFlagSetAction(db, orgId, "a-flag", false);

      const flags = await featureFlagsListAction(db, orgId);
      expect(flags.map((f) => f.key)).toEqual(["a-flag", "z-flag"]);
    } finally {
      await db.close();
    }
  });
});

// --- Custom Fields ---

describe("custom fields", () => {
  test("create, list, delete", async () => {
    const { db, orgId } = await freshDb("custom-fields");
    try {
      const p = await createProject(db, { orgId, slug: "p", name: "P" });
      const f1 = await customFieldCreateAction(db, {
        orgId,
        projectId: p.id,
        name: "Priority Label",
        fieldType: "select",
        options: ["low", "med", "high"],
        sortOrder: 0,
      });
      const f2 = await customFieldCreateAction(db, {
        orgId,
        projectId: p.id,
        name: "URL",
        fieldType: "url",
        sortOrder: 1,
      });

      const fields = await customFieldsListAction(db, orgId, p.id);
      expect(fields).toHaveLength(2);
      expect(fields[0]!.name).toBe("Priority Label");
      expect(fields[1]!.name).toBe("URL");

      await customFieldDeleteAction(db, f1.id, orgId);
      const after = await customFieldsListAction(db, orgId, p.id);
      expect(after).toHaveLength(1);
      expect(after[0]!.id).toBe(f2.id);
    } finally {
      await db.close();
    }
  });

  test("reorder updates sort_order", async () => {
    const { db, orgId } = await freshDb("custom-fields-reorder");
    try {
      const f1 = await customFieldCreateAction(db, { orgId, name: "A", fieldType: "text", sortOrder: 0 });
      const f2 = await customFieldCreateAction(db, { orgId, name: "B", fieldType: "text", sortOrder: 1 });
      const f3 = await customFieldCreateAction(db, { orgId, name: "C", fieldType: "text", sortOrder: 2 });

      // reorder: C, A, B
      await customFieldReorderAction(db, orgId, [f3.id, f1.id, f2.id]);
      const fields = await customFieldsListAction(db, orgId);
      expect(fields.map((f) => f.name)).toEqual(["C", "A", "B"]);
    } finally {
      await db.close();
    }
  });

  test("all 8 field types accepted", async () => {
    const { db, orgId } = await freshDb("custom-fields-types");
    try {
      const types = ["text", "select", "multi_select", "number", "date", "user", "url", "json"];
      for (const t of types) {
        await customFieldCreateAction(db, { orgId, name: t, fieldType: t });
      }
      const fields = await customFieldsListAction(db, orgId);
      expect(fields).toHaveLength(8);
    } finally {
      await db.close();
    }
  });
});

// --- Saved Views ---

describe("saved views", () => {
  test("CRUD lifecycle", async () => {
    const { db, orgId } = await freshDb("saved-views");
    try {
      const view = await savedViewCreateAction(db, {
        orgId,
        name: "My Bugs",
        filterAst: { status: "pending", label: "bug" },
        scope: "private",
      });
      expect(view.name).toBe("My Bugs");
      expect(view.scope).toBe("private");

      // update
      const updated = await savedViewUpdateAction(db, view.id, orgId, {
        name: "All Bugs",
        isDefault: true,
      });
      expect(updated.name).toBe("All Bugs");
      expect(updated.is_default).toBe(true);

      // list
      const views = await savedViewsListAction(db, orgId);
      expect(views).toHaveLength(1);

      // delete
      await savedViewDeleteAction(db, view.id, orgId);
      expect(await savedViewsListAction(db, orgId)).toHaveLength(0);
    } finally {
      await db.close();
    }
  });
});

// --- Members ---

describe("members", () => {
  test("add and update role", async () => {
    const { db, orgId } = await freshDb("members");
    try {
      const member = await memberAddAction(db, orgId, "alice@example.com", "member");
      expect(member.role).toBe("member");

      const updated = await memberRoleUpdateAction(db, member.id, orgId, "admin");
      expect(updated.role).toBe("admin");

      const members = await membersListAction(db, orgId);
      expect(members).toHaveLength(1);
      expect(members[0]!.user_email).toBe("alice@example.com");
    } finally {
      await db.close();
    }
  });
});

// --- Invitations ---

describe("invitations", () => {
  test("create and list", async () => {
    const { db, orgId } = await freshDb("invitations");
    try {
      await invitationCreateAction(db, orgId, "bob@example.com", "viewer", "admin@local");
      await invitationCreateAction(db, orgId, "carol@example.com");

      const invites = await invitationsListAction(db, orgId);
      expect(invites).toHaveLength(2);
      expect(invites[0]!.status).toBe("pending");
      const emails = invites.map((i) => i.email).sort();
      expect(emails).toEqual(["bob@example.com", "carol@example.com"]);
    } finally {
      await db.close();
    }
  });
});
