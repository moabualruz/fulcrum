import type { Renderer } from "../renderer.ts";
import { c, pad, truncate } from "../renderer.ts";

export interface TuiAutomationRule {
  id: string;
  name: string;
  triggerType: string;
  actionType: string;
  enabled: boolean;
  projectId: string;
  projectName?: string | null;
  executionCount: number;
}

export interface AutomationRuleFormInput {
  name: string;
  triggerType: string;
  actionType: string;
  projectId?: string;
}

export interface AutomationRulesScreenOptions {
  caller: {
    automations: {
      list: (input?: { projectId?: string }) => Promise<TuiAutomationRule[]>;
      create: (input: AutomationRuleFormInput) => Promise<TuiAutomationRule>;
      update: (input: { id: string; enabled?: boolean }) => Promise<TuiAutomationRule>;
      delete: (input: { id: string }) => Promise<{ ok: boolean }>;
    };
  };
  projectId?: string;
}

type Overlay = "none" | "new" | "delete";

export class AutomationRulesScreen {
  private rules: TuiAutomationRule[] = [];
  private cursor = 0;
  private query = "";
  private overlay: Overlay = "none";
  private pendingDeleteId: string | null = null;

  constructor(private readonly opts: AutomationRulesScreenOptions) {}

  async load(): Promise<void> {
    await this.reload();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Settings > Automation rules"));
    renderer.separator();
    renderer.writeln();
    renderer.writeln(`  Search: ${this.query || c.dim("(none)")}`);
    renderer.writeln();
    renderer.writeln(`  ${pad("Rule", 30)} ${pad("Project", 18)} ${pad("Trigger", 18)} ${pad("Action", 18)} ${pad("Status", 9)} Runs`);
    renderer.writeln(c.dim(`  ${pad("", 30, "-")} ${pad("", 18, "-")} ${pad("", 18, "-")} ${pad("", 18, "-")} ${pad("", 9, "-")} ----`));

    if (this.visibleRules.length === 0) {
      renderer.writeln(c.dim("  No automation rules match the current search."));
    } else {
      for (const rule of this.visibleRules) {
        const index = this.rules.indexOf(rule);
        const pointer = index === this.cursor ? c.bold(">") : " ";
        const status = rule.enabled ? c.green("enabled") : c.dim("disabled");
        renderer.writeln([
          pointer,
          pad(truncate(rule.name, 30), 30),
          pad(truncate(rule.projectName ?? rule.projectId, 18), 18),
          pad(truncate(humanize(rule.triggerType), 18), 18),
          pad(truncate(humanize(rule.actionType), 18), 18),
          pad(status, 9),
          String(rule.executionCount),
        ].join(" "));
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  / search  n new  Space toggle  d delete  j/k navigate  q back"));

    if (this.overlay === "new") {
      renderer.writeln();
      renderer.writeln(c.bold("  New automation rule"));
      renderer.writeln(c.dim("  submitRuleForm({ name, triggerType, actionType })"));
    }

    if (this.overlay === "delete" && this.selectedRule) {
      renderer.writeln();
      renderer.writeln(c.red(`  Delete automation rule? ${this.selectedRule.name} [y/N]`));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (this.overlay === "delete") {
      if (key === "y" || key === "Y") {
        const id = this.pendingDeleteId;
        if (!id) return false;
        await this.opts.caller.automations.delete({ id });
        this.rules = this.rules.filter((rule) => rule.id !== id);
        this.overlay = "none";
        this.pendingDeleteId = null;
        this.clampCursor();
        return true;
      }
      if (key === "n" || key === "N" || key === "\x1b") {
        this.overlay = "none";
        this.pendingDeleteId = null;
        return true;
      }
      return false;
    }

    if (key === "n") {
      this.overlay = "new";
      return true;
    }

    if (key === "d") {
      const rule = this.selectedRule;
      if (!rule) return false;
      this.overlay = "delete";
      this.pendingDeleteId = rule.id;
      return true;
    }

    if (key === " ") {
      const rule = this.selectedRule;
      if (!rule) return false;
      const updated = await this.opts.caller.automations.update({ id: rule.id, enabled: !rule.enabled });
      this.rules = this.rules.map((candidate) => candidate.id === updated.id ? updated : candidate);
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

  setSearch(query: string): void {
    this.query = query;
    const firstVisible = this.visibleRules[0];
    this.cursor = firstVisible ? this.rules.indexOf(firstVisible) : 0;
  }

  async submitRuleForm(input: AutomationRuleFormInput): Promise<void> {
    const name = input.name.trim();
    if (!name) {
      this.overlay = "none";
      return;
    }
    const created = await this.opts.caller.automations.create({
      ...input,
      name,
      projectId: input.projectId ?? this.opts.projectId,
    });
    this.rules = [...this.rules, created];
    this.cursor = this.rules.length - 1;
    this.overlay = "none";
  }

  private get visibleRules(): TuiAutomationRule[] {
    const needle = this.query.trim().toLowerCase();
    if (!needle) return this.rules;
    return this.rules.filter((rule) => [
      rule.name,
      rule.projectName ?? rule.projectId,
      humanize(rule.triggerType),
      humanize(rule.actionType),
      rule.enabled ? "enabled" : "disabled",
    ].some((value) => value.toLowerCase().includes(needle)));
  }

  private get selectedRule(): TuiAutomationRule | undefined {
    return this.rules[this.cursor];
  }

  private async reload(): Promise<void> {
    this.rules = await this.opts.caller.automations.list(
      this.opts.projectId ? { projectId: this.opts.projectId } : {},
    );
    this.clampCursor();
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.rules.length - 1));
  }
}

function humanize(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
