import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { NotificationChannel } from "@fulcrum/server/trpc/schemas/notifications.ts";

export interface TuiNotificationRule {
  id: string;
  name: string;
  enabled: boolean;
  channels: NotificationChannel[];
}

export interface TuiQuietHours {
  id?: string;
  tz: string;
  startHour: number;
  endHour: number;
  daysOfWeek: number[];
}

export interface NotificationRulesScreenOptions {
  caller: {
    notify: {
      rules: {
        list: () => Promise<TuiNotificationRule[]>;
        create: (input: {
          name: string;
          eventPattern: Record<string, unknown>;
          channels: NotificationChannel[];
          enabled: boolean;
        }) => Promise<TuiNotificationRule>;
        update: (input: { id: string; enabled?: boolean; name?: string }) => Promise<TuiNotificationRule>;
        delete: (input: { id: string }) => Promise<{ ok: boolean }>;
      };
      quietHours: {
        get: () => Promise<TuiQuietHours | null>;
        set: (input: TuiQuietHours) => Promise<TuiQuietHours>;
      };
    };
  };
}

export class NotificationRulesScreen {
  private rules: TuiNotificationRule[] = [];
  private quietHours: TuiQuietHours | null = null;
  private cursor = 0;
  private overlay: "none" | "new" | "edit" = "none";

  constructor(private readonly opts: NotificationRulesScreenOptions) {}

  async load(): Promise<void> {
    await this.reload();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Settings > Notifications"));
    renderer.separator();
    renderer.writeln();
    renderer.writeln(c.bold("  Rules"));

    if (this.rules.length === 0) {
      renderer.writeln(c.dim("  No notification rules."));
    } else {
      for (let i = 0; i < this.rules.length; i++) {
        const rule = this.rules[i];
        if (!rule) continue;
        const pointer = i === this.cursor ? c.bold(">") : " ";
        const enabled = rule.enabled ? c.green("[on]") : c.dim("[off]");
        renderer.writeln(`${pointer} ${enabled} ${rule.name} ${c.dim(rule.channels.join(","))}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.bold("  Quiet hours"));
    if (this.quietHours) {
      renderer.writeln(
        `  ${this.quietHours.tz} ${this.quietHours.startHour}-${this.quietHours.endHour} days:${this.quietHours.daysOfWeek.join(",")}`,
      );
    } else {
      renderer.writeln(c.dim("  Not configured."));
    }

    renderer.writeln();
    renderer.writeln(c.dim("  N new  E edit  D delete  Space toggle  q back"));
    if (this.overlay === "new") renderer.writeln(c.dim("  Rule name:"));
    if (this.overlay === "edit") renderer.writeln(c.dim("  Edit rule name:"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "N") {
      this.overlay = "new";
      return true;
    }

    if (key === "E") {
      if (!this.selectedRule) return false;
      this.overlay = "edit";
      return true;
    }

    if (key === "D") {
      const rule = this.selectedRule;
      if (!rule) return false;
      await this.opts.caller.notify.rules.delete({ id: rule.id });
      this.rules = this.rules.filter((candidate) => candidate.id !== rule.id);
      this.cursor = Math.min(this.cursor, Math.max(0, this.rules.length - 1));
      return true;
    }

    if (key === " ") {
      const rule = this.selectedRule;
      if (!rule) return false;
      const updated = await this.opts.caller.notify.rules.update({ id: rule.id, enabled: !rule.enabled });
      this.rules[this.cursor] = updated;
      return true;
    }

    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.rules.length - 1));
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }

    return false;
  }

  async submitRuleName(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      this.overlay = "none";
      return;
    }

    if (this.overlay === "edit" && this.selectedRule) {
      const updated = await this.opts.caller.notify.rules.update({ id: this.selectedRule.id, name: trimmed });
      this.rules[this.cursor] = updated;
      this.overlay = "none";
      return;
    }

    const created = await this.opts.caller.notify.rules.create({
      name: trimmed,
      eventPattern: {},
      channels: ["in-app"],
      enabled: true,
    });
    this.rules.push(created);
    this.overlay = "none";
  }

  async saveQuietHours(input: TuiQuietHours): Promise<void> {
    this.quietHours = await this.opts.caller.notify.quietHours.set(input);
  }

  private get selectedRule(): TuiNotificationRule | undefined {
    return this.rules[this.cursor];
  }

  private async reload(): Promise<void> {
    const [rules, quietHours] = await Promise.all([
      this.opts.caller.notify.rules.list(),
      this.opts.caller.notify.quietHours.get(),
    ]);
    this.rules = rules;
    this.quietHours = quietHours;
    this.cursor = Math.min(this.cursor, Math.max(0, this.rules.length - 1));
  }
}
