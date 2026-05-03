/**
 * TUI screen stub — webhooks management (P13 surface parity).
 *
 * Provides in-process smoke interface for the parity matrix test.
 * Full interactive UI is tracked separately; this stub satisfies the
 * "TUI reachable" criterion for the webhooks domain.
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

export interface TuiWebhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  enabled: boolean;
  createdAt?: string | null;
}

export interface WebhookListResult {
  items: TuiWebhook[];
  total: number;
}

export function renderWebhookList(renderer: Renderer, result: WebhookListResult): void {
  renderer.render(
    c("box", {},
      c("text", {}, `Webhooks (${result.total})`),
      ...result.items.map((w) =>
        c("text", {}, `${w.id}  ${w.url}  ${w.enabled ? "ON" : "OFF"}`)
      ),
    ),
  );
}
