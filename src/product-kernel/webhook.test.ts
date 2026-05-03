import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "./db/pglite.ts";
import { runMigrations } from "./db/migrate.ts";
import { createLocalOrg, appendEvent } from "./store/repositories.ts";
import { newUlid } from "./ids.ts";
import {
  type WebhookDispatchResult,
  computeHmacSignature,
  dispatchWebhook,
  nextRetryDelay,
  createDelivery,
  getDelivery,
  updateDeliveryStatus,
  createWebhookConfig,
  getWebhookConfig,
} from "./webhook.ts";
import type { ProductDb } from "./db/types.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-webhook-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  return db;
}

async function seedOrgAndRule(db: ProductDb) {
  const org = await createLocalOrg(db, { slug: "o", name: "O" });
  const ruleId = newUlid();
  await db.query(
    `INSERT INTO notification_rules (id, org_id, name, event_pattern, channels)
     VALUES ($1, $2, 'test-rule', 'task.*', '{webhook}')`,
    [ruleId, org.id],
  );
  return { org, ruleId };
}

async function seedNotification(db: ProductDb, orgId: string, ruleId: string) {
  const eventId = newUlid();
  await appendEvent(db, {
    orgId,
    actor: "agent",
    subjectKind: "task",
    subjectId: newUlid(),
    verb: "created",
  });
  // Get the event we just created
  const events = await db.query<{ id: string }>(
    "SELECT id FROM events WHERE org_id = $1 ORDER BY created_at DESC LIMIT 1",
    [orgId],
  );
  const notifId = newUlid();
  await db.query(
    `INSERT INTO notifications (id, org_id, user_id, event_id, rule_id, channel, title)
     VALUES ($1, $2, 'user-1', $3, $4, 'webhook', 'Test notification')`,
    [notifId, orgId, events[0]!.id, ruleId],
  );
  return notifId;
}

describe("HMAC signature", () => {
  test("computes sha256 HMAC with sha256= prefix", () => {
    const sig = computeHmacSignature("hello world", "mysecret");
    expect(sig).toStartWith("sha256=");
    expect(sig.length).toBeGreaterThan(10);
    // Deterministic
    expect(sig).toBe(computeHmacSignature("hello world", "mysecret"));
  });

  test("different body → different signature", () => {
    const a = computeHmacSignature("body-a", "secret");
    const b = computeHmacSignature("body-b", "secret");
    expect(a).not.toBe(b);
  });

  test("different secret → different signature", () => {
    const a = computeHmacSignature("body", "secret-a");
    const b = computeHmacSignature("body", "secret-b");
    expect(a).not.toBe(b);
  });
});

describe("exponential backoff", () => {
  test("attempt 0 → 5000ms", () => {
    expect(nextRetryDelay(0)).toBe(5000);
  });
  test("attempt 1 → 10000ms", () => {
    expect(nextRetryDelay(1)).toBe(10000);
  });
  test("attempt 2 → 20000ms", () => {
    expect(nextRetryDelay(2)).toBe(20000);
  });
  test("attempt 3 → 40000ms", () => {
    expect(nextRetryDelay(3)).toBe(40000);
  });
  test("attempt 4+ capped at 60000ms", () => {
    expect(nextRetryDelay(4)).toBe(60000);
    expect(nextRetryDelay(10)).toBe(60000);
  });
});

describe("webhook delivery persistence", () => {
  test("createDelivery + getDelivery round-trips", async () => {
    const db = await freshDb("delivery-rt");
    try {
      const { org, ruleId } = await seedOrgAndRule(db);
      const notifId = await seedNotification(db, org.id, ruleId);
      const del = await createDelivery(db, {
        orgId: org.id,
        notificationId: notifId,
        channel: "webhook",
      });
      expect(del.status).toBe("pending");
      expect(del.attempts).toBe(0);
      expect(del.max_attempts).toBe(5);

      const got = await getDelivery(db, del.id);
      expect(got).not.toBeNull();
      expect(got!.id).toBe(del.id);
    } finally {
      await db.close();
    }
  });

  test("updateDeliveryStatus to sent", async () => {
    const db = await freshDb("delivery-sent");
    try {
      const { org, ruleId } = await seedOrgAndRule(db);
      const notifId = await seedNotification(db, org.id, ruleId);
      const del = await createDelivery(db, {
        orgId: org.id,
        notificationId: notifId,
        channel: "webhook",
      });
      await updateDeliveryStatus(db, del.id, {
        status: "sent",
        attempts: 1,
      });
      const got = await getDelivery(db, del.id);
      expect(got!.status).toBe("sent");
      expect(got!.attempts).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("updateDeliveryStatus to failed with error", async () => {
    const db = await freshDb("delivery-fail");
    try {
      const { org, ruleId } = await seedOrgAndRule(db);
      const notifId = await seedNotification(db, org.id, ruleId);
      const del = await createDelivery(db, {
        orgId: org.id,
        notificationId: notifId,
        channel: "webhook",
      });
      await updateDeliveryStatus(db, del.id, {
        status: "failed",
        attempts: 5,
        lastError: "max retries exceeded",
      });
      const got = await getDelivery(db, del.id);
      expect(got!.status).toBe("failed");
      expect(got!.last_error).toBe("max retries exceeded");
    } finally {
      await db.close();
    }
  });
});

describe("webhook config persistence", () => {
  test("createWebhookConfig + getWebhookConfig round-trips", async () => {
    const db = await freshDb("wh-config");
    try {
      const { org, ruleId } = await seedOrgAndRule(db);
      const cfg = await createWebhookConfig(db, {
        orgId: org.id,
        ruleId,
        url: "https://example.com/hook",
        encryptedSecret: "enc:abc123",
      });
      expect(cfg.url).toBe("https://example.com/hook");
      expect(cfg.encrypted_secret).toBe("enc:abc123");

      const got = await getWebhookConfig(db, ruleId);
      expect(got).not.toBeNull();
      expect(got!.url).toBe("https://example.com/hook");
    } finally {
      await db.close();
    }
  });
});

describe("dispatchWebhook", () => {
  test("flag OFF → no HTTP request, returns skipped", async () => {
    const result = await dispatchWebhook({
      url: "https://example.com/hook",
      body: '{"test":true}',
      secret: "s",
      featureEnabled: false,
    });
    expect(result.outcome).toBe("skipped");
    expect(result.statusCode).toBeUndefined();
  });

  test("flag ON → POST with valid HMAC header (using mock fetch)", async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";
    let capturedMethod = "";
    const mockFetch = async (_input: string | URL | Request, init?: RequestInit) => {
      capturedMethod = init?.method ?? "GET";
      capturedBody = init?.body as string;
      const h = init?.headers;
      if (h && typeof h === "object" && !Array.isArray(h) && !(h instanceof Headers)) {
        capturedHeaders = h as Record<string, string>;
      }
      return new Response("ok", { status: 200 });
    };

    const body = '{"event":"task.created"}';
    const result = await dispatchWebhook({
      url: "https://example.com/hook",
      body,
      secret: "mysecret",
      featureEnabled: true,
      fetchImpl: mockFetch,
    });

    expect(result.outcome).toBe("sent");
    expect(result.statusCode).toBe(200);
    expect(capturedMethod).toBe("POST");
    expect(capturedBody).toBe(body);
    expect(capturedHeaders["X-Fulcrum-Signature-256"]).toBe(
      computeHmacSignature(body, "mysecret"),
    );
    expect(capturedHeaders["Content-Type"]).toBe("application/json");
  });

  test("4xx response → retry outcome", async () => {
    const mockFetch = async () =>
      new Response("bad request", { status: 400 });

    const result = await dispatchWebhook({
      url: "https://example.com/hook",
      body: "{}",
      secret: "s",
      featureEnabled: true,
      fetchImpl: mockFetch,
    });

    expect(result.outcome).toBe("retry");
    expect(result.statusCode).toBe(400);
  });

  test("5xx response → retry outcome", async () => {
    const mockFetch = async () =>
      new Response("internal error", { status: 500 });

    const result = await dispatchWebhook({
      url: "https://example.com/hook",
      body: "{}",
      secret: "s",
      featureEnabled: true,
      fetchImpl: mockFetch,
    });

    expect(result.outcome).toBe("retry");
    expect(result.statusCode).toBe(500);
  });

  test("network error → retry outcome with error message", async () => {
    const mockFetch = async () => {
      throw new Error("ECONNREFUSED");
    };

    const result = await dispatchWebhook({
      url: "https://example.com/hook",
      body: "{}",
      secret: "s",
      featureEnabled: true,
      fetchImpl: mockFetch,
    });

    expect(result.outcome).toBe("retry");
    expect(result.error).toContain("ECONNREFUSED");
    expect(result.statusCode).toBeUndefined();
  });

  test("200 → sent outcome", async () => {
    const mockFetch = async () =>
      new Response("ok", { status: 200 });

    const result = await dispatchWebhook({
      url: "https://example.com/hook",
      body: "{}",
      secret: "s",
      featureEnabled: true,
      fetchImpl: mockFetch,
    });

    expect(result.outcome).toBe("sent");
    expect(result.statusCode).toBe(200);
  });
});
