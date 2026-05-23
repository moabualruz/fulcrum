import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

export interface TuiWebhook {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  enabled: boolean;
  createdAt?: string | null;
  lastDeliveryAt?: string | null;
  lastDeliveryStatus?: string | null;
}

export interface WebhookListResult {
  items: TuiWebhook[];
  total: number;
}

export interface WebhooksScreenOptions {
  caller: {
    webhooks: {
      list: () => Promise<TuiWebhook[]>;
      testDelivery?: (input: { id: string }) => Promise<Partial<TuiWebhook> & { id: string }>;
      toggle?: (input: { id: string; enabled: boolean }) => Promise<Partial<TuiWebhook> & { id: string }>;
    };
  };
  onOpenWebhook?: (id: string) => void;
}

export class WebhooksScreen {
  private webhooks: TuiWebhook[] = [];
  private cursor = 0;

  constructor(private readonly opts: WebhooksScreenOptions) {}

  async load(): Promise<void> {
    this.webhooks = await this.opts.caller.webhooks.list();
    this.cursor = Math.min(this.cursor, Math.max(0, this.webhooks.length - 1));
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Webhooks"));
    renderer.separator();
    renderer.writeln();

    if (this.webhooks.length === 0) {
      renderer.writeln(c.dim("  No webhooks configured."));
    } else {
      for (let index = 0; index < this.webhooks.length; index++) {
        const webhook = this.webhooks[index]!;
        const prefix = index === this.cursor ? c.bold("> ") : "  ";
        const enabled = webhook.enabled ? "ON" : "OFF";
        const events = webhook.events.join(",");
        const delivery = webhook.lastDeliveryStatus ?? "none";
        renderer.writeln(`${prefix}${webhook.id}  ${webhook.url}  ${enabled}  events: ${events}  delivery: ${delivery}  last: ${webhook.lastDeliveryAt ?? "never"}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  j/k navigate  Enter inspect  t test delivery  Space toggle  q back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.webhooks.length - 1));
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(this.cursor - 1, 0);
      return true;
    }

    if (key === "\r" || key === "\n") {
      const webhook = this.webhooks[this.cursor];
      if (!webhook) return false;
      this.opts.onOpenWebhook?.(webhook.id);
      return true;
    }

    if (key === "t") {
      await this.testCurrent();
      return true;
    }

    if (key === " ") {
      await this.toggleCurrent();
      return true;
    }

    return false;
  }

  private async testCurrent(): Promise<void> {
    const webhook = this.webhooks[this.cursor];
    if (!webhook || !this.opts.caller.webhooks.testDelivery) return;
    const updated = await this.opts.caller.webhooks.testDelivery({ id: webhook.id });
    this.mergeWebhook(updated);
  }

  private async toggleCurrent(): Promise<void> {
    const webhook = this.webhooks[this.cursor];
    if (!webhook || !this.opts.caller.webhooks.toggle) return;
    const updated = await this.opts.caller.webhooks.toggle({ id: webhook.id, enabled: !webhook.enabled });
    this.mergeWebhook(updated);
  }

  private mergeWebhook(updated: Partial<TuiWebhook> & { id: string }): void {
    this.webhooks = this.webhooks.map((webhook) => (
      webhook.id === updated.id ? { ...webhook, ...updated } : webhook
    ));
  }
}

export function renderWebhookList(renderer: Renderer, result: WebhookListResult): void {
  renderer.writeln(`Webhooks (${result.total})`);
  for (const webhook of result.items) {
    renderer.writeln(`${webhook.id}  ${webhook.url}  ${webhook.enabled ? "ON" : "OFF"}`);
  }
}
