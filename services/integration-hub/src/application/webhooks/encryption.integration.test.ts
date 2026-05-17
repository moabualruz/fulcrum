import { describe, expect, test } from "bun:test";

import {
  createWebhookSubscription,
  listWebhookSubscriptions,
  type WebhookSubscriptionRecord,
} from "@integration-hub/application/webhooks/commands.ts";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
} from "@integration-hub/application/webhooks/encryption.ts";

describe("webhook secret encryption", () => {
  test("stores whsec_plaintext_test encrypted at rest and decrypts with the original key", async () => {
    const plaintext = "whsec_plaintext_test";
    const key = "test-key-material-32-bytes-minimum";
    const encrypted = await encryptWebhookSecret(plaintext, { keyMaterial: key });

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toMatch(/^whsec:v1:/);
    await expect(decryptWebhookSecret(encrypted, { keyMaterial: key })).resolves.toBe(plaintext);
  });

  test("decrypt with wrong key fails", async () => {
    const encrypted = await encryptWebhookSecret("whsec_plaintext_test", {
      keyMaterial: "test-key-material-32-bytes-minimum",
    });

    await expect(decryptWebhookSecret(encrypted, {
      keyMaterial: "wrong-key-material-32-bytes-minimum",
    })).rejects.toThrow("webhook secret decrypt failed");
  });

  test("create stores encrypted secret and list response never exposes plaintext", async () => {
    const rows = new Map<string, WebhookSubscriptionRecord>();
    const repo = {
      async save(record: WebhookSubscriptionRecord): Promise<WebhookSubscriptionRecord> {
        rows.set(record.id, record);
        return record;
      },
      async list(orgId: string): Promise<WebhookSubscriptionRecord[]> {
        return [...rows.values()].filter((row) => row.orgId === orgId);
      },
    };

    const created = await createWebhookSubscription({
      orgId: "org_1",
      url: "https://example.com/webhook",
      secret: "whsec_plaintext_test",
      events: ["task.created"],
    }, {
      repository: repo,
      keyMaterial: "test-key-material-32-bytes-minimum",
      id: () => "webhook_1",
      now: () => new Date("2026-05-06T00:00:00Z"),
    });

    const stored = rows.get(created.id);
    expect(stored?.encryptedSecret).toBeDefined();
    expect(stored?.encryptedSecret).not.toBe("whsec_plaintext_test");
    expect(created).not.toHaveProperty("secret");
    expect(created).toHaveProperty("secretRedacted", true);

    const listed = await listWebhookSubscriptions("org_1", {
      repository: repo,
      keyMaterial: "test-key-material-32-bytes-minimum",
    });

    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("secret");
    expect(JSON.stringify(listed)).not.toContain("whsec_plaintext_test");
  });
});
