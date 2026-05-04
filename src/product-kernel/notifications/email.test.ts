import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "../db/pglite.ts";
import { runMigrations } from "../db/migrate.ts";
import { createLocalOrg } from "../store/repositories.ts";
import type { ProductDb } from "../db/types.ts";
import {
  createUser,
  generateVerifyToken,
  confirmVerifyToken,
  sendEmailNotification,
  countRecentDeliveries,
  type SmtpTransport,
  type EmailPayload,
} from "./email.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-email-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  return db;
}

function mockTransport(): SmtpTransport & { calls: EmailPayload[] } {
  const calls: EmailPayload[] = [];
  return {
    calls,
    async sendMail(payload: EmailPayload) {
      calls.push(payload);
      return { messageId: `mock-${calls.length}` };
    },
  };
}

function failTransport(error: string): SmtpTransport {
  return {
    async sendMail() {
      throw new Error(error);
    },
  };
}

describe("email notification channel", () => {
  test("flag OFF → no nodemailer calls", async () => {
    const db = await freshDb("flag-off");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const user = await createUser(db, { orgId: org.id, email: "a@b.com", emailVerified: true });
      const transport = mockTransport();
      const result = await sendEmailNotification(db, {
        userId: user.id,
        orgId: org.id,
        subject: "test",
        body: "hello",
        transport,
        featureEnabled: false,
      });
      expect(result).toBeNull();
      expect(transport.calls).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  test("flag ON → email sent via mock transport, status=sent", async () => {
    const db = await freshDb("flag-on-sent");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const user = await createUser(db, { orgId: org.id, email: "a@b.com", emailVerified: true });
      const transport = mockTransport();
      const result = await sendEmailNotification(db, {
        userId: user.id,
        orgId: org.id,
        subject: "test sub",
        body: "hello body",
        transport,
        featureEnabled: true,
      });
      expect(result).not.toBeNull();
      expect(result!.status).toBe("sent");
      expect(transport.calls).toHaveLength(1);
      expect(transport.calls[0]!.to).toBe("a@b.com");
      expect(transport.calls[0]!.subject).toBe("test sub");
    } finally {
      await db.close();
    }
  });

  test("SMTP failure → status=failed + last_error", async () => {
    const db = await freshDb("smtp-fail");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const user = await createUser(db, { orgId: org.id, email: "a@b.com", emailVerified: true });
      const transport = failTransport("SMTP connect timeout");
      const result = await sendEmailNotification(db, {
        userId: user.id,
        orgId: org.id,
        subject: "test",
        body: "hello",
        transport,
        featureEnabled: true,
      });
      expect(result).not.toBeNull();
      expect(result!.status).toBe("failed");
      expect(result!.last_error).toBe("SMTP connect timeout");
    } finally {
      await db.close();
    }
  });

  test("rate limit >5/hr → status=suppressed", async () => {
    const db = await freshDb("rate-limit");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const user = await createUser(db, { orgId: org.id, email: "a@b.com", emailVerified: true });
      const transport = mockTransport();

      // Send 5 emails successfully
      for (let i = 0; i < 5; i++) {
        await sendEmailNotification(db, {
          userId: user.id,
          orgId: org.id,
          subject: `msg ${i}`,
          body: "body",
          transport,
          featureEnabled: true,
        });
      }
      expect(transport.calls).toHaveLength(5);

      // 6th should be suppressed
      const result = await sendEmailNotification(db, {
        userId: user.id,
        orgId: org.id,
        subject: "msg 6",
        body: "body",
        transport,
        featureEnabled: true,
      });
      expect(result).not.toBeNull();
      expect(result!.status).toBe("suppressed");
      expect(result!.suppression_reason).toBe("rate_limit");
      // No additional SMTP call
      expect(transport.calls).toHaveLength(5);
    } finally {
      await db.close();
    }
  });

  test("unverified email → suppressed", async () => {
    const db = await freshDb("unverified");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const user = await createUser(db, { orgId: org.id, email: "a@b.com", emailVerified: false });
      const transport = mockTransport();
      const result = await sendEmailNotification(db, {
        userId: user.id,
        orgId: org.id,
        subject: "test",
        body: "hello",
        transport,
        featureEnabled: true,
      });
      expect(result).not.toBeNull();
      expect(result!.status).toBe("suppressed");
      expect(result!.suppression_reason).toBe("email_not_verified");
      expect(transport.calls).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  test("verify token → confirm → email_verified=true", async () => {
    const db = await freshDb("verify-token");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const user = await createUser(db, { orgId: org.id, email: "a@b.com", emailVerified: false });

      const token = await generateVerifyToken(db, user.id);
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");

      const confirmed = await confirmVerifyToken(db, token);
      expect(confirmed).toBe(true);

      // Now user should be verified — can send email
      const transport = mockTransport();
      const result = await sendEmailNotification(db, {
        userId: user.id,
        orgId: org.id,
        subject: "post-verify",
        body: "body",
        transport,
        featureEnabled: true,
      });
      expect(result!.status).toBe("sent");
      expect(transport.calls).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  test("quiet-hours respected (delivery held via suppression)", async () => {
    const db = await freshDb("quiet-hours");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const user = await createUser(db, { orgId: org.id, email: "a@b.com", emailVerified: true });
      const transport = mockTransport();
      const result = await sendEmailNotification(db, {
        userId: user.id,
        orgId: org.id,
        subject: "test",
        body: "hello",
        transport,
        featureEnabled: true,
        quietHoursActive: true,
      });
      expect(result).not.toBeNull();
      expect(result!.status).toBe("suppressed");
      expect(result!.suppression_reason).toBe("quiet_hours");
      expect(transport.calls).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  test("countRecentDeliveries counts only sent within window", async () => {
    const db = await freshDb("count-recent");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const user = await createUser(db, { orgId: org.id, email: "a@b.com", emailVerified: true });
      const transport = mockTransport();

      await sendEmailNotification(db, {
        userId: user.id,
        orgId: org.id,
        subject: "s",
        body: "b",
        transport,
        featureEnabled: true,
      });

      const count = await countRecentDeliveries(db, user.id, "email", 60);
      expect(count).toBe(1);
    } finally {
      await db.close();
    }
  });
});
