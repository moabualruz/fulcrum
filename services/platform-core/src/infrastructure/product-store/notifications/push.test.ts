import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg } from "@test-support/product-workspace-fixtures.ts";
import type { TestStore } from "@test-support/product-workspace-fixtures.ts";
import {
  deliverPush,
  isPushEnabled,
  listPushSubscriptions,
  removePushSubscription,
  subscribePush,
  unsubscribePush,
  type PushSender,
  type PushSendResult,
} from "./push.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-push-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

let dbIdx = 0;
async function freshDb(): Promise<TestStore> {
  const db = await openIsolatedStore(join(scratch, `push-${dbIdx++}`));
  await migrateIsolatedStore(db);
  return db;
}

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

describe("isPushEnabled", () => {
  const origEnv = process.env.FULCRUM_FEATURES;

  afterAll(() => {
    if (origEnv === undefined) delete process.env.FULCRUM_FEATURES;
    else process.env.FULCRUM_FEATURES = origEnv;
  });

  test("returns false when FULCRUM_FEATURES unset", () => {
    delete process.env.FULCRUM_FEATURES;
    expect(isPushEnabled()).toBe(false);
  });

  test("returns false when FULCRUM_FEATURES does not include notify-push", () => {
    process.env.FULCRUM_FEATURES = "notify-email,public-api";
    expect(isPushEnabled()).toBe(false);
  });

  test("returns true when FULCRUM_FEATURES includes notify-push", () => {
    process.env.FULCRUM_FEATURES = "notify-push";
    expect(isPushEnabled()).toBe(true);
  });

  test("returns true when notify-push among multiple flags", () => {
    process.env.FULCRUM_FEATURES = "notify-email, notify-push, public-api";
    expect(isPushEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Subscription CRUD
// ---------------------------------------------------------------------------

describe("push subscription store", () => {
  test("subscribe creates a subscription row", async () => {
    const db = await freshDb();
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const sub = await subscribePush(db, {
        orgId: org.id,
        userId: "user-1",
        endpoint: "https://fcm.example.com/push/abc",
        p256dh: "key-p256dh",
        auth: "key-auth",
        userAgent: "Chrome/120",
      });
      expect(sub.user_id).toBe("user-1");
      expect(sub.endpoint).toBe("https://fcm.example.com/push/abc");
      expect(sub.p256dh).toBe("key-p256dh");
      expect(sub.auth).toBe("key-auth");
      expect(sub.user_agent).toBe("Chrome/120");
    } finally {
      await db.close();
    }
  });

  test("subscribe upserts on same (user, endpoint)", async () => {
    const db = await freshDb();
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await subscribePush(db, {
        orgId: org.id,
        userId: "user-1",
        endpoint: "https://fcm.example.com/push/abc",
        p256dh: "old-p256dh",
        auth: "old-auth",
      });
      const updated = await subscribePush(db, {
        orgId: org.id,
        userId: "user-1",
        endpoint: "https://fcm.example.com/push/abc",
        p256dh: "new-p256dh",
        auth: "new-auth",
      });
      expect(updated.p256dh).toBe("new-p256dh");
      expect(updated.auth).toBe("new-auth");
      // Should still be one row.
      const all = await listPushSubscriptions(db, "user-1");
      expect(all.length).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("unsubscribe removes subscription", async () => {
    const db = await freshDb();
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await subscribePush(db, {
        orgId: org.id,
        userId: "user-1",
        endpoint: "https://fcm.example.com/push/abc",
        p256dh: "k",
        auth: "a",
      });
      const removed = await unsubscribePush(db, "user-1", "https://fcm.example.com/push/abc");
      expect(removed).toBe(true);
      const all = await listPushSubscriptions(db, "user-1");
      expect(all.length).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("unsubscribe returns false when no match", async () => {
    const db = await freshDb();
    try {
      const removed = await unsubscribePush(db, "no-user", "https://x.example.com");
      expect(removed).toBe(false);
    } finally {
      await db.close();
    }
  });

  test("listPushSubscriptions returns only user's subs", async () => {
    const db = await freshDb();
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await subscribePush(db, {
        orgId: org.id, userId: "u1", endpoint: "https://a.example.com", p256dh: "k", auth: "a",
      });
      await subscribePush(db, {
        orgId: org.id, userId: "u1", endpoint: "https://b.example.com", p256dh: "k", auth: "a",
      });
      await subscribePush(db, {
        orgId: org.id, userId: "u2", endpoint: "https://c.example.com", p256dh: "k", auth: "a",
      });
      const u1Subs = await listPushSubscriptions(db, "u1");
      const u2Subs = await listPushSubscriptions(db, "u2");
      expect(u1Subs.length).toBe(2);
      expect(u2Subs.length).toBe(1);
    } finally {
      await db.close();
    }
  });
});

// ---------------------------------------------------------------------------
// deliverPush
// ---------------------------------------------------------------------------

describe("deliverPush", () => {
  const vapidOpts = {
    vapidSubject: "mailto:test@example.com",
    vapidPublicKey: "test-pub-key",
    vapidPrivateKey: "test-priv-key",
  };

  function mockSender(statusCode: number): PushSender {
    return async () => ({ statusCode, body: "" });
  }

  test("flag OFF → no VAPID calls, returns empty", async () => {
    const origEnv = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const db = await freshDb();
      try {
        const org = await createLocalOrg(db, { slug: "o", name: "O" });
        await subscribePush(db, {
          orgId: org.id, userId: "u1", endpoint: "https://a.example.com", p256dh: "k", auth: "a",
        });
        let called = false;
        const sender: PushSender = async () => {
          called = true;
          return { statusCode: 201, body: "" };
        };
        const results = await deliverPush({
          db, userId: "u1", title: "Test", body: "Hello", sender, ...vapidOpts,
        });
        expect(results.length).toBe(0);
        expect(called).toBe(false);
      } finally {
        await db.close();
      }
    } finally {
      if (origEnv === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = origEnv;
    }
  });

  test("flag ON → sendNotification called with correct subscription", async () => {
    const origEnv = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "notify-push";
    try {
      const db = await freshDb();
      try {
        const org = await createLocalOrg(db, { slug: "o", name: "O" });
        await subscribePush(db, {
          orgId: org.id, userId: "u1", endpoint: "https://fcm.example.com/push/abc",
          p256dh: "test-p256dh", auth: "test-auth",
        });

        let capturedSub: unknown;
        let capturedPayload: string | undefined;
        const sender: PushSender = async (sub, payload, opts) => {
          capturedSub = sub;
          capturedPayload = payload;
          return { statusCode: 201, body: "" };
        };

        const results = await deliverPush({
          db, userId: "u1", title: "Build done", body: "PR #42 passed", sender, ...vapidOpts,
        });

        expect(results.length).toBe(1);
        expect(results[0]!.status).toBe("sent");
        expect(capturedSub).toEqual({
          endpoint: "https://fcm.example.com/push/abc",
          keys: { p256dh: "test-p256dh", auth: "test-auth" },
        });
        const parsed = JSON.parse(capturedPayload!);
        expect(parsed.title).toBe("Build done");
        expect(parsed.body).toBe("PR #42 passed");
      } finally {
        await db.close();
      }
    } finally {
      if (origEnv === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = origEnv;
    }
  });

  test("201 → status='sent'", async () => {
    const origEnv = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "notify-push";
    try {
      const db = await freshDb();
      try {
        const org = await createLocalOrg(db, { slug: "o", name: "O" });
        await subscribePush(db, {
          orgId: org.id, userId: "u1", endpoint: "https://a.example.com", p256dh: "k", auth: "a",
        });
        const results = await deliverPush({
          db, userId: "u1", title: "T", body: "B", sender: mockSender(201), ...vapidOpts,
        });
        expect(results[0]!.status).toBe("sent");
      } finally {
        await db.close();
      }
    } finally {
      if (origEnv === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = origEnv;
    }
  });

  test("410 → subscription deleted, status='gone'", async () => {
    const origEnv = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "notify-push";
    try {
      const db = await freshDb();
      try {
        const org = await createLocalOrg(db, { slug: "o", name: "O" });
        await subscribePush(db, {
          orgId: org.id, userId: "u1", endpoint: "https://a.example.com", p256dh: "k", auth: "a",
        });
        const results = await deliverPush({
          db, userId: "u1", title: "T", body: "B", sender: mockSender(410), ...vapidOpts,
        });
        expect(results[0]!.status).toBe("gone");
        // Subscription should be removed from DB.
        const remaining = await listPushSubscriptions(db, "u1");
        expect(remaining.length).toBe(0);
      } finally {
        await db.close();
      }
    } finally {
      if (origEnv === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = origEnv;
    }
  });

  test("sender throws → status='failed', subscription kept", async () => {
    const origEnv = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "notify-push";
    try {
      const db = await freshDb();
      try {
        const org = await createLocalOrg(db, { slug: "o", name: "O" });
        await subscribePush(db, {
          orgId: org.id, userId: "u1", endpoint: "https://a.example.com", p256dh: "k", auth: "a",
        });
        const throwingSender: PushSender = async () => {
          throw new Error("network error");
        };
        const results = await deliverPush({
          db, userId: "u1", title: "T", body: "B", sender: throwingSender, ...vapidOpts,
        });
        expect(results[0]!.status).toBe("failed");
        // Subscription should still exist.
        const remaining = await listPushSubscriptions(db, "u1");
        expect(remaining.length).toBe(1);
      } finally {
        await db.close();
      }
    } finally {
      if (origEnv === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = origEnv;
    }
  });

  test("delivers to all subscriptions for user", async () => {
    const origEnv = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "notify-push";
    try {
      const db = await freshDb();
      try {
        const org = await createLocalOrg(db, { slug: "o", name: "O" });
        await subscribePush(db, {
          orgId: org.id, userId: "u1", endpoint: "https://a.example.com", p256dh: "k", auth: "a",
        });
        await subscribePush(db, {
          orgId: org.id, userId: "u1", endpoint: "https://b.example.com", p256dh: "k", auth: "a",
        });
        const results = await deliverPush({
          db, userId: "u1", title: "T", body: "B", sender: mockSender(201), ...vapidOpts,
        });
        expect(results.length).toBe(2);
        expect(results.every((r) => r.status === "sent")).toBe(true);
      } finally {
        await db.close();
      }
    } finally {
      if (origEnv === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = origEnv;
    }
  });
});
