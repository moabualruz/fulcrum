import { createRequire } from "node:module";

import type { DeliveryHandlerResult, NotificationDeliveryLike } from "./webhook.ts";

export interface SmtpConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
}

export interface SmtpTransporter {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
}

export interface SmtpDeliveryOptions {
  now?: () => Date;
  config?: SmtpConfig;
  createTransporter?: (config: Required<SmtpConfig>) => SmtpTransporter;
}

export async function deliverSmtpNotification(
  delivery: NotificationDeliveryLike,
  options: SmtpDeliveryOptions = {},
): Promise<DeliveryHandlerResult> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const attemptCount = delivery.attemptCount + 1;
  const maxAttempts = delivery.maxAttempts ?? 5;
  const config = resolveSmtpConfig(options.config);
  const idempotencyKey = stringPayload(delivery.payload, "idempotencyKey") ?? `${delivery.id}:${attemptCount}`;

  if (!config) {
    return {
      provider: "smtp",
      status: "failed",
      attemptCount,
      maxAttempts,
      nextAttemptAt: null,
      lastAttemptAt: startedAt,
      sentAt: null,
      responseStatus: null,
      responseBodyExcerpt: null,
      errorCode: "missing_config",
      errorMessage: "SMTP configuration missing",
      durationMs: 0,
      idempotencyKey,
    };
  }

  try {
    const transporter = options.createTransporter
      ? options.createTransporter(config)
      : await createNodemailerTransporter(config);
    const message = {
      from: config.from,
      to: stringPayload(delivery.payload, "to") ?? stringPayload(delivery.payload, "email") ?? "",
      subject: stringPayload(delivery.payload, "title") ?? "Fulcrum notification",
      text: stringPayload(delivery.payload, "body") ?? JSON.stringify(delivery.payload),
    };

    if (!message.to) {
      return failedResult(delivery, attemptCount, maxAttempts, startedAt, now(), "missing_recipient", "SMTP recipient missing", idempotencyKey);
    }

    await transporter.sendMail(message);
    const finishedAt = now();
    return {
      provider: "smtp",
      status: "sent",
      attemptCount,
      maxAttempts,
      nextAttemptAt: null,
      lastAttemptAt: startedAt,
      sentAt: startedAt,
      responseStatus: 202,
      responseBodyExcerpt: "accepted",
      errorCode: null,
      errorMessage: null,
      durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      idempotencyKey,
    };
  } catch (error) {
    return failedResult(
      delivery,
      attemptCount,
      maxAttempts,
      startedAt,
      now(),
      "smtp_error",
      error instanceof Error ? redactSecrets(error.message, config) : "SMTP delivery failed",
      idempotencyKey,
    );
  }
}

export function resolveSmtpConfig(config: SmtpConfig | undefined = undefined): Required<SmtpConfig> | null {
  const cfg = config ?? {};
  const host = cfg.host ?? process.env.SMTP_HOST;
  const port = Number(cfg.port ?? process.env.SMTP_PORT ?? 587);
  const user = cfg.user ?? process.env.SMTP_USER;
  const pass = cfg.pass ?? process.env.SMTP_PASS;
  const from = cfg.from ?? process.env.SMTP_FROM;
  if (!host || !user || !pass || !from) return null;
  return { host, port, user, pass, from };
}

async function createNodemailerTransporter(config: Required<SmtpConfig>): Promise<SmtpTransporter> {
  const require = createRequire(import.meta.url);
  const nodemailer = require("nodemailer") as { createTransport(options: unknown): SmtpTransporter };
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  }) as SmtpTransporter;
}

function failedResult(
  delivery: NotificationDeliveryLike,
  attemptCount: number,
  maxAttempts: number,
  startedAt: Date,
  finishedAt: Date,
  errorCode: string,
  errorMessage: string,
  idempotencyKey: string,
): DeliveryHandlerResult {
  return {
    provider: "smtp",
    status: attemptCount >= maxAttempts ? "failed" : "retrying",
    attemptCount,
    maxAttempts,
    nextAttemptAt: attemptCount >= maxAttempts ? null : new Date(startedAt.getTime() + 60_000),
    lastAttemptAt: startedAt,
    sentAt: null,
    responseStatus: null,
    responseBodyExcerpt: null,
    errorCode,
    errorMessage,
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    idempotencyKey,
  };
}

function stringPayload(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function redactSecrets(message: string, config: Required<SmtpConfig>): string {
  let redacted = message;
  for (const secret of [config.user, config.pass]) {
    if (secret) redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}
