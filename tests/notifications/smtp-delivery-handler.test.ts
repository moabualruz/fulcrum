import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  deliverSmtpNotification,
  resolveSmtpConfig,
  type SmtpTransporter,
} from "../../src/notifications/delivery-handlers/smtp.ts";
import type { NotificationDeliveryLike } from "../../src/notifications/delivery-handlers/webhook.ts";

const ORIGINAL_ENV = {
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function delivery(overrides: Partial<NotificationDeliveryLike> = {}): NotificationDeliveryLike {
  return {
    id: "delivery-1",
    payload: {
      to: "user@example.com",
      title: "Build finished",
      body: "All checks passed",
      idempotencyKey: "idem-1",
    },
    attemptCount: 0,
    maxAttempts: 3,
    ...overrides,
  };
}

beforeEach(() => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;
});

afterEach(() => {
  restoreEnv();
});

describe("SMTP delivery handler", () => {
  it("resolves explicit and env SMTP config and rejects incomplete config", () => {
    expect(resolveSmtpConfig()).toBeNull();
    expect(resolveSmtpConfig({ host: "smtp.local", user: "u", pass: "p", from: "noreply@example.com" })).toEqual({
      host: "smtp.local",
      port: 587,
      user: "u",
      pass: "p",
      from: "noreply@example.com",
    });

    process.env.SMTP_HOST = "smtp.env";
    process.env.SMTP_PORT = "2525";
    process.env.SMTP_USER = "env-user";
    process.env.SMTP_PASS = "env-pass";
    process.env.SMTP_FROM = "env@example.com";
    expect(resolveSmtpConfig()).toEqual({
      host: "smtp.env",
      port: 2525,
      user: "env-user",
      pass: "env-pass",
      from: "env@example.com",
    });
  });

  it("sends a real SMTP message through the injected transporter contract", async () => {
    const sent: unknown[] = [];
    const nowValues = [
      new Date("2026-05-11T10:00:00.000Z"),
      new Date("2026-05-11T10:00:00.125Z"),
    ];

    const result = await deliverSmtpNotification(delivery(), {
      config: { host: "smtp.local", port: 2525, user: "smtp-user", pass: "smtp-pass", from: "noreply@example.com" },
      now: () => nowValues.shift() ?? new Date("2026-05-11T10:00:00.125Z"),
      createTransporter: (config): SmtpTransporter => {
        expect(config.host).toBe("smtp.local");
        return {
          async sendMail(message) {
            sent.push(message);
          },
        };
      },
    });

    expect(sent).toEqual([{
      from: "noreply@example.com",
      to: "user@example.com",
      subject: "Build finished",
      text: "All checks passed",
    }]);
    expect(result).toMatchObject({
      provider: "smtp",
      status: "sent",
      attemptCount: 1,
      maxAttempts: 3,
      responseStatus: 202,
      responseBodyExcerpt: "accepted",
      idempotencyKey: "idem-1",
      durationMs: 125,
    });
  });

  it("returns truthful failure and retry states for missing config, missing recipients, and transporter errors", async () => {
    await expect(deliverSmtpNotification(delivery())).resolves.toMatchObject({
      provider: "smtp",
      status: "failed",
      errorCode: "missing_config",
      idempotencyKey: "idem-1",
    });

    await expect(
      deliverSmtpNotification(delivery({ payload: { body: "No recipient" }, attemptCount: 1, maxAttempts: 3 }), {
        config: { host: "smtp.local", user: "smtp-user", pass: "smtp-pass", from: "noreply@example.com" },
        now: () => new Date("2026-05-11T10:00:00.000Z"),
        createTransporter: () => ({ async sendMail() {} }),
      }),
    ).resolves.toMatchObject({
      status: "retrying",
      attemptCount: 2,
      errorCode: "missing_recipient",
      idempotencyKey: "delivery-1:2",
    });

    await expect(
      deliverSmtpNotification(delivery({ attemptCount: 2, maxAttempts: 3 }), {
        config: { host: "smtp.local", user: "smtp-user", pass: "smtp-secret", from: "noreply@example.com" },
        now: () => new Date("2026-05-11T10:00:00.000Z"),
        createTransporter: () => ({
          async sendMail() {
            throw new Error("smtp-user rejected smtp-secret");
          },
        }),
      }),
    ).resolves.toMatchObject({
      status: "failed",
      attemptCount: 3,
      nextAttemptAt: null,
      errorCode: "smtp_error",
      errorMessage: "[redacted] rejected [redacted]",
    });
  });
});
