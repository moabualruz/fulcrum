import { describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { createTestOrm } from "../../test-utils/db.ts";
import { AppNotFoundError, AppValidationError } from "../errors.ts";
import { createNotification, markNotificationRead } from "./commands.ts";
import { getNotification, listNotifications } from "./queries.ts";

const ctx = { orgId: DEFAULT_ORG_ID, userId: "00000000-0000-0000-0000-000000000010", projectId: null };

describe("application notifications", () => {
  test("handles CRUD, not-found, validation, and scoping", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const notification = await createNotification(em, ctx, { eventId: "33333333-3333-4333-8333-333333333333", entityKind: "task", entityId: "44444444-4444-4444-8444-444444444444", title: "Assigned" });
      expect(await listNotifications(em, ctx, { unread: true })).toHaveLength(1);
      await markNotificationRead(em, ctx, notification.id);
      await expect(getNotification(em, ctx, notification.id)).resolves.toMatchObject({ id: notification.id, read: true });
      await expect(getNotification(em, ctx, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
      await expect(createNotification(em, ctx, { eventId: "", entityKind: "", entityId: "", title: "" })).rejects.toBeInstanceOf(AppValidationError);
    } finally {
      await db.close();
    }
  });
});
