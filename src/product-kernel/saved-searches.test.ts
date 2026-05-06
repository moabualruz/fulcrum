import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../test-support/product-fixtures.ts";
import { createLocalOrg } from "../test-support/product-fixtures.ts";
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
} from "./saved-searches.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-saved-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("saved searches", () => {
  test("create + list + delete round-trip", async () => {
    const db = await openIsolatedStore(join(scratch, "saved1"));
    try {
      await migrateIsolatedStore(db);
      const org = await createLocalOrg(db, { slug: "o", name: "O" });

      const created = await createSavedSearch(db, {
        orgId: org.id,
        userId: "user1",
        name: "my search",
        queryJson: { text: "foo", filters: { kind: "task" } },
        scope: "private",
      });
      expect(created.name).toBe("my search");
      expect(created.scope).toBe("private");

      const list = await listSavedSearches(db, {
        orgId: org.id,
        userId: "user1",
      });
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe(created.id);

      const deleted = await deleteSavedSearch(db, created.id, "user1");
      expect(deleted).toBe(true);

      const listAfter = await listSavedSearches(db, {
        orgId: org.id,
        userId: "user1",
      });
      expect(listAfter).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  test("private scope hidden from other users", async () => {
    const db = await openIsolatedStore(join(scratch, "saved2"));
    try {
      await migrateIsolatedStore(db);
      const org = await createLocalOrg(db, { slug: "o2", name: "O2" });

      await createSavedSearch(db, {
        orgId: org.id,
        userId: "user1",
        name: "private search",
        queryJson: { text: "bar" },
        scope: "private",
      });
      await createSavedSearch(db, {
        orgId: org.id,
        userId: "user1",
        name: "org search",
        queryJson: { text: "baz" },
        scope: "org",
      });

      // user2 should see only the org-scoped one
      const user2List = await listSavedSearches(db, {
        orgId: org.id,
        userId: "user2",
      });
      expect(user2List).toHaveLength(1);
      expect(user2List[0]!.name).toBe("org search");
    } finally {
      await db.close();
    }
  });

  test("delete fails for wrong user", async () => {
    const db = await openIsolatedStore(join(scratch, "saved3"));
    try {
      await migrateIsolatedStore(db);
      const org = await createLocalOrg(db, { slug: "o3", name: "O3" });

      const created = await createSavedSearch(db, {
        orgId: org.id,
        userId: "user1",
        name: "x",
        queryJson: {},
        scope: "private",
      });
      const deleted = await deleteSavedSearch(db, created.id, "user2");
      expect(deleted).toBe(false);
    } finally {
      await db.close();
    }
  });
});
