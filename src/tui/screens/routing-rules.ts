import type { Renderer } from "../renderer.ts";
import { c, pad, truncate } from "../renderer.ts";

export interface TuiRoutingRule {
  id: string;
  orgId: string;
  projectId: string | null;
  name: string;
  conditionsJson: Record<string, unknown>;
  actionAgent: string;
  actionSkillSet: string[];
  priority: number;
  enabled: boolean;
  source: "manual" | "learned" | "imported";
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface TuiRoutingDecision {
  ruleId: string | null;
  source: string;
  agent: string;
  confidence: number | null;
}

export type RoutingRuleFormInput = Partial<Pick<
  TuiRoutingRule,
  "id" | "name" | "projectId" | "conditionsJson" | "actionAgent" | "actionSkillSet" | "priority" | "enabled"
>>;

export interface RoutingRulesScreenOptions {
  caller: {
    routing: {
      list: (input?: Record<string, unknown>) => Promise<TuiRoutingRule[]>;
      create: (input: Omit<RoutingRuleFormInput, "id">) => Promise<TuiRoutingRule>;
      update: (input: RoutingRuleFormInput & { id: string }) => Promise<TuiRoutingRule | null>;
      delete: (input: { id: string }) => Promise<{ ok: boolean }>;
      dryRun: (input: { taskJson: Record<string, unknown> }) => Promise<TuiRoutingDecision | null>;
    };
  };
  projectId?: string | null;
  viewportRows?: number;
}

type RoutingOverlay = "none" | "new" | "edit" | "delete" | "test";

export class RoutingRulesScreen {
  private rules: TuiRoutingRule[] = [];
  private cursor = 0;
  private scrollTop = 0;
  private overlay: RoutingOverlay = "none";
  private decision: TuiRoutingDecision | null = null;

  constructor(private readonly opts: RoutingRulesScreenOptions) {}

  async load(): Promise<void> {
    const input = this.opts.projectId ? { projectId: this.opts.projectId } : {};
    this.rules = await this.opts.caller.routing.list(input);
    this.clampCursor();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Routing Rules"));
    renderer.separator();
    renderer.writeln();

    renderer.writeln(`  ${pad("Name", 28)} ${pad("Agent", 16)} ${pad("Scope", 16)} ${pad("Priority", 8)} ${pad("Source", 10)} Enabled`);
    renderer.writeln(c.dim(`  ${pad("", 28, "-")} ${pad("", 16, "-")} ${pad("", 16, "-")} ${pad("", 8, "-")} ${pad("", 10, "-")} -------`));

    if (this.visibleRules.length === 0) {
      renderer.writeln(c.dim("  No routing rules."));
    } else {
      for (const row of this.visibleRules) {
        const index = this.rules.indexOf(row);
        const pointer = index === this.cursor ? c.bold(">") : " ";
        renderer.writeln([
          pointer,
          pad(truncate(row.name, 28), 28),
          pad(truncate(row.actionAgent, 16), 16),
          pad(scopeLabel(row), 16),
          pad(String(row.priority), 8),
          pad(row.source, 10),
          row.enabled ? "yes" : "no",
        ].join(" "));
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  j/k navigate  n new  e edit  d delete  t test  q back"));
    this.renderOverlay(renderer);
  }

  async handleKey(key: string): Promise<boolean> {
    if (this.overlay === "delete") {
      if (key === "y" || key === "Y") {
        const row = this.selectedRule;
        if (!row) return false;
        await this.opts.caller.routing.delete({ id: row.id });
        this.rules = this.rules.filter((candidate) => candidate.id !== row.id);
        this.overlay = "none";
        this.clampCursor();
        return true;
      }
      if (key === "n" || key === "N" || key === "\x1b") {
        this.overlay = "none";
        return true;
      }
    }

    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.rules.length - 1));
      this.keepCursorVisible();
      return true;
    }
    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      this.keepCursorVisible();
      return true;
    }
    if (key === "n") {
      this.overlay = "new";
      this.decision = null;
      return true;
    }
    if (key === "e" && this.selectedRule) {
      this.overlay = "edit";
      return true;
    }
    if (key === "d" && this.selectedRule) {
      this.overlay = "delete";
      return true;
    }
    if (key === "t" && this.selectedRule) {
      this.overlay = "test";
      this.decision = null;
      return true;
    }
    return false;
  }

  async submitRuleForm(input: RoutingRuleFormInput): Promise<void> {
    if (this.overlay === "new") {
      const created = await this.opts.caller.routing.create(withDefaults(input, this.opts.projectId ?? null));
      this.rules = [created, ...this.rules];
      this.cursor = 0;
      this.scrollTop = 0;
      this.overlay = "none";
      return;
    }

    if (this.overlay !== "edit") return;
    const id = input.id ?? this.selectedRule?.id;
    if (!id) return;
    const updated = await this.opts.caller.routing.update({ ...input, id });
    if (updated) {
      const index = this.rules.findIndex((row) => row.id === updated.id);
      if (index >= 0) this.rules[index] = updated;
    }
    this.overlay = "none";
  }

  async submitDryRun(taskJson: Record<string, unknown>): Promise<void> {
    this.decision = await this.opts.caller.routing.dryRun({ taskJson });
    this.overlay = "test";
  }

  get visibleRules(): readonly TuiRoutingRule[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.rules.slice(this.scrollTop, this.scrollTop + rows);
  }

  private get selectedRule(): TuiRoutingRule | undefined {
    return this.rules[this.cursor];
  }

  private renderOverlay(renderer: Renderer): void {
    if (this.overlay === "none") return;
    renderer.writeln();
    if (this.overlay === "new") {
      renderer.writeln(c.bold("  New routing rule"));
      renderer.writeln(c.dim("  name / agent / scope / priority / conditions JSON / enabled"));
      return;
    }
    if (this.overlay === "edit") {
      const row = this.selectedRule;
      renderer.writeln(c.bold("  Edit routing rule"));
      if (row) {
        renderer.infoRow("Name", row.name);
        renderer.infoRow("Enabled", row.enabled ? "yes" : "no");
      }
      return;
    }
    if (this.overlay === "delete") {
      renderer.writeln(c.red("  Delete routing rule?"));
      renderer.writeln(c.dim("  Confirm? [y/N]"));
      return;
    }
    renderer.writeln(c.bold("  Test routing rule"));
    const row = this.selectedRule;
    if (row) {
      renderer.writeln(`  Conditions JSON: ${JSON.stringify(row.conditionsJson)}`);
      renderer.writeln(c.dim("  Task facts: title / kind / priority / tags"));
    }
    if (this.decision) {
      renderer.writeln();
      renderer.writeln(c.green(`  Decision: ${this.decision.agent}`));
      renderer.writeln(`  source: ${this.decision.source}`);
      if (this.decision.ruleId) renderer.writeln(`  rule: ${this.decision.ruleId}`);
    }
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.rules.length - 1));
    this.keepCursorVisible();
  }

  private keepCursorVisible(): void {
    const rows = this.opts.viewportRows ?? 20;
    if (this.cursor < this.scrollTop) this.scrollTop = this.cursor;
    if (this.cursor >= this.scrollTop + rows) this.scrollTop = this.cursor - rows + 1;
  }
}

function scopeLabel(row: TuiRoutingRule): string {
  return row.projectId ? "project" : "global";
}

function withDefaults(input: RoutingRuleFormInput, projectId: string | null): Omit<RoutingRuleFormInput, "id"> {
  return {
    name: input.name ?? "Untitled rule",
    projectId: input.projectId ?? projectId,
    conditionsJson: input.conditionsJson ?? {},
    actionAgent: input.actionAgent ?? "codex",
    actionSkillSet: input.actionSkillSet ?? [],
    priority: input.priority ?? 100,
    enabled: input.enabled ?? true,
  };
}
