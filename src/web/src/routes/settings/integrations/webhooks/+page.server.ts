/**
 * /settings/integrations/webhooks — outbound webhook subscription management.
 *
 * Gated by FULCRUM_FEATURES=notify-webhook (C1, default OFF).
 * Flag OFF → 404. Flag ON → list/create webhook subscriptions + delivery log.
 */

import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export function isNotifyWebhookEnabled(): boolean {
  const features = (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((f) => f.trim());
  return features.includes("notify-webhook");
}

export interface WebhookSubscription {
  id: string;
  url: string;
  eventPattern: string;
  signingSecret: string;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  event: string;
  status: "success" | "failure" | "pending";
  responseCode: number | null;
  deliveredAt: string;
}

/** In-memory stub store for subscriptions (replaced by DB in production). */
const _subscriptions: WebhookSubscription[] = [];
const _deliveries: WebhookDelivery[] = [];

export function getSubscriptions(): WebhookSubscription[] {
  return _subscriptions;
}

export function addSubscription(sub: WebhookSubscription): void {
  _subscriptions.push(sub);
}

export function getDeliveries(): WebhookDelivery[] {
  return _deliveries;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.session) {
    throw redirect(302, "/auth/login");
  }
  if (!isNotifyWebhookEnabled()) {
    throw error(404, "Webhook feature is not enabled");
  }
  return {
    subscriptions: getSubscriptions(),
    deliveries: getDeliveries(),
  };
};

export const actions: Actions = {
  create: async ({ locals, request }) => {
    if (!locals.session) throw redirect(302, "/auth/login");
    if (!isNotifyWebhookEnabled()) throw error(404, "Webhook feature is not enabled");

    const form = await request.formData();
    const url = String(form.get("url") ?? "").trim();
    const eventPattern = String(form.get("eventPattern") ?? "").trim();
    const signingSecret = String(form.get("signingSecret") ?? "").trim();

    if (!url) return fail(400, { createError: "URL is required" });
    if (!eventPattern) return fail(400, { createError: "Event pattern is required" });

    try {
      new URL(url);
    } catch {
      return fail(400, { createError: "URL must be a valid URL" });
    }

    const sub: WebhookSubscription = {
      id: crypto.randomUUID(),
      url,
      eventPattern,
      signingSecret: signingSecret || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    addSubscription(sub);
    return { ok: true, id: sub.id };
  },
};
