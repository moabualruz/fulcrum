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

export interface TuiEnrichedDecision {
  status: string;
  matchedRuleId: string | null;
  draftId: string | null;
  factsUsed: Record<string, unknown>;
  confidence: number | null;
  backend: string | null;
  model: string | null;
  whyUnmatched: string | null;
  evidence: string[];
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
      test: (input: { taskId: string }) => Promise<TuiEnrichedDecision | null>;
      dryRun: (input: { taskJson: Record<string, unknown> }) => Promise<TuiEnrichedDecision | null>;
      drafts: {
        list: (input?: Record<string, unknown>) => Promise<TuiEnrichedDecision[]>;
        approve: (input: { draftId: string }) => Promise<{ ok: boolean }>;
        delete: (input: { draftId: string }) => Promise<{ ok: boolean }>;
        update: (input: Record<string, unknown>) => Promise<{ ok: boolean }>;
      };
    };
  };
  projectId?: string | null;
  viewportRows?: number;
}

type RoutingTab = "Rules" | "Drafts" | "Test" | "Backends";
type RoutingOverlay = "none" | "new" | "edit" | "delete" | "test" | "raw-json";

/** Map a status string to a styled label (never color-only per UI-SPEC). */
function statusLabel(status: string): string {
  switch (status) {
    case "matched": return "matched";
    case "no_match": return "abstained";
    case "recommended": return "review_needed";
    case "conflict": return "conflict";
    case "abstained": return "abstained";
    case "draft_created": return "review_needed";
    default: return status;
  }
}

export class RoutingRulesScreen {
  private rules: TuiRoutingRule[] = [];
  private drafts: TuiEnrichedDecision[] = [];
  private cursor = 0;
  private draftCursor = 0;
  private scrollTop = 0;
  private activeTab: RoutingTab = "Rules";
  private overlay: RoutingOverlay = "none";
  private decision: TuiEnrichedDecision | null = null;
  private rawJsonInput = "";
  private rawJsonError = "";

  constructor(private readonly opts: RoutingRulesScreenOptions) {}

  async load(): Promise<void> {
    this.decision = null;
    await this._loadRules();
    this.clampCursor();
  }

  private async _loadRules(): Promise<void> {
    const input = this.opts.projectId ? { projectId: this.opts.projectId } : {};
    this.rules = await this.opts.caller.routing.list(input);
  }

  private async _loadDrafts(): Promise<void> {
    this.drafts = await this.opts.caller.routing.drafts.list({});
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Settings › Routing Rules"));
    renderer.separator();
    renderer.writeln();

    // Tabs
    const tabs: RoutingTab[] = ["Rules", "Drafts", "Test", "Backends"];
    const tabLine = tabs.map((t) => t === this.activeTab ? c.bold(` ${t} `) : c.dim(` ${t} `)).join("│");
    renderer.writeln(`  ${tabLine}`);
    renderer.writeln(c.dim(`  ${pad("", 50, "─")}`));
    renderer.writeln();

    switch (this.activeTab) {
      case "Rules":
        this._renderRulesTab(renderer);
        break;
      case "Drafts":
        this._renderDraftsTab(renderer);
        break;
      case "Test":
        this._renderTestTab(renderer);
        break;
      case "Backends":
        this._renderBackendsTab(renderer);
        break;
    }

    renderer.writeln();
    renderer.writeln(c.dim(this._helpText()));
    this.renderOverlay(renderer);
  }

  private _helpText(): string {
    const tabNav = "h/l prev/next tab";
    switch (this.activeTab) {
      case "Rules": return `${tabNav}  j/k navigate  n new  e edit  d delete  t test  q back`;
      case "Drafts": return `${tabNav}  j/k navigate  a approve  d delete  t test  q back`;
      case "Test": return `${tabNav}  t test (raw JSON)  r run test  q back`;
      case "Backends": return `${tabNav}  q back`;
    }
  }

  // ── Rules Tab ───────────────────────────────────────────────────────

  private _renderRulesTab(renderer: Renderer): void {
    renderer.writeln(`  ${pad("Name", 28)} ${pad("Agent", 16)} ${pad("Scope", 16)} ${pad("Priority", 8)} ${pad("Source", 10)} Enabled`);
    renderer.writeln(c.dim(`  ${pad("", 28, "-")} ${pad("", 16, "-")} ${pad("", 16, "-")} ${pad("", 8, "-")} ${pad("", 10, "-")} ------`));

    if (this.rules.length === 0) {
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
          row.enabled ? c.green("yes") : c.dim("no"),
        ].join(" "));
      }
    }
  }

  // ── Drafts Tab (D-09, D-10, D-12, D-25) ────────────────────────────

  private _renderDraftsTab(renderer: Renderer): void {
    renderer.writeln(`  ${pad("Draft ID", 38)} ${pad("Status", 22)} ${pad("Confidence", 12)} Backend`);
    renderer.writeln(c.dim(`  ${pad("", 38, "-")} ${pad("", 22, "-")} ${pad("", 12, "-")} -------`));

    if (this.drafts.length === 0) {
      renderer.writeln(c.dim("  No drafts. Run a route test to capture a learned draft."));
    } else {
      for (const draft of this.visibleDrafts) {
        const index = this.drafts.indexOf(draft);
        const pointer = index === this.draftCursor ? c.bold(">") : " ";
        const label = statusLabel(draft.status);
        const statusColor = label === "conflict" ? c.yellow(label) : label === "abstained" ? c.dim(label) : c.green(label);
        renderer.writeln([
          pointer,
          pad(truncate(draft.draftId ?? "(new)", 38), 38),
          pad(statusColor, 22),
          pad(String(draft.confidence ?? ""), 12),
          draft.backend ?? "(none)",
        ].join(" "));
      }
    }
  }

  // ── Test Tab (D-26) ─────────────────────────────────────────────────

  private _renderTestTab(renderer: Renderer): void {
    renderer.writeln(c.bold("  Route Test"));
    renderer.writeln(c.dim("  Enter task facts as raw JSON and run a test."));
    renderer.writeln();

    if (!this.rawJsonInput) {
      renderer.writeln(c.dim('  Example: {"kind":"bug","priority":"high","tags":["backend"]}'));
    } else {
      renderer.writeln(`  Input: ${this.rawJsonInput}`);
    }
    if (this.rawJsonError) {
      renderer.writeln(c.red(`  Error: ${this.rawJsonError}`));
    }

    if (this.decision) {
      renderer.writeln();
      renderer.writeln(c.bold("  Result"));
      renderer.writeln(`  Status: ${statusLabel(this.decision.status)}`);
      renderer.writeln(`  Confidence: ${this.decision.confidence ?? "N/A"}`);
      const selectedAgent = this.selectedRule?.actionAgent;
      if (selectedAgent) {
        renderer.writeln(`  Decision: ${selectedAgent}`);
        renderer.writeln("  source: rule");
      }
      if (this.decision.matchedRuleId) renderer.writeln(`  Matched rule: ${this.decision.matchedRuleId}`);
      if (this.decision.backend) renderer.writeln(`  Backend: ${this.decision.backend}`);
      if (this.decision.whyUnmatched) renderer.writeln(`  Why: ${this.decision.whyUnmatched}`);
      if (this.decision.evidence.length > 0) {
        renderer.writeln(c.dim("  Evidence:"));
        for (const ev of this.decision.evidence) {
          renderer.writeln(c.dim(`    - ${ev}`));
        }
      }
    }
  }

  // ── Backends Tab ────────────────────────────────────────────────────

  private _renderBackendsTab(renderer: Renderer): void {
    renderer.writeln(c.bold("  Inference Backends"));
    renderer.writeln();
    const features = (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((f) => f.trim());
    const llmEnabled = features.includes("router-llm");
    const inputMode = process.env["FULCRUM_LLM_INPUT_MODE"] ?? "full_context";

    renderer.infoRow("LLM Routing", llmEnabled ? c.green("enabled") : c.red("disabled"));
    renderer.infoRow("Input mode", inputMode);
    renderer.infoRow("Embedded", "configured");
    renderer.infoRow("Ollama", "unconfigured");
    renderer.infoRow("LM Studio", "unconfigured");
    renderer.infoRow("OpenAI-compatible", "unconfigured");
    renderer.writeln();

    const backends = [
      { name: "embedded", label: "Embedded (default)" },
      { name: "ollama", label: "Ollama" },
      { name: "lm-studio", label: "LM Studio" },
      { name: "openai", label: "OpenAI-compatible" },
    ];
    for (const b of backends) {
      const isEnabled = b.name === "embedded";
      const statusLabel = isEnabled ? c.green("running") : c.dim("unconfigured");
      renderer.writeln(`  ${b.label} ${statusLabel}`);
    }
  }

  // ── Keyboard handling ───────────────────────────────────────────────

  async handleKey(key: string): Promise<boolean> {
    // Handle overlay keys first
    if (this.overlay === "delete") {
      if (key === "y" || key === "Y") {
        if (this.activeTab === "Drafts") {
          const draft = this.selectedDraft;
          if (!draft || !draft.draftId) return false;
          await this.opts.caller.routing.drafts.delete({ draftId: draft.draftId });
          this.drafts = this.drafts.filter((candidate) => candidate.draftId !== draft.draftId);
        } else {
          const row = this.selectedRule;
          if (!row) return false;
          await this.opts.caller.routing.delete({ id: row.id });
          this.rules = this.rules.filter((candidate) => candidate.id !== row.id);
        }
        this.overlay = "none";
        this.clampCursor();
        return true;
      }
      if (key === "n" || key === "N" || key === "\x1b") {
        this.overlay = "none";
        return true;
      }
    }

    // Tab navigation
    if (key === "h") {
      const tabs: RoutingTab[] = ["Rules", "Drafts", "Test", "Backends"];
      const idx = tabs.indexOf(this.activeTab);
      if (idx > 0) {
        this.activeTab = tabs[idx - 1]!;
        this.cursor = 0;
        this.draftCursor = 0;
        this.decision = null;
        if (this.activeTab === "Drafts") await this._loadDrafts();
      }
      return true;
    }
    if (key === "l") {
      const tabs: RoutingTab[] = ["Rules", "Drafts", "Test", "Backends"];
      const idx = tabs.indexOf(this.activeTab);
      if (idx < tabs.length - 1) {
        this.activeTab = tabs[idx + 1]!;
        this.cursor = 0;
        this.draftCursor = 0;
        this.decision = null;
        if (this.activeTab === "Drafts") await this._loadDrafts();
      }
      return true;
    }

    if (key === "d" && this.activeTab === "Test" && this.selectedRule) {
      this.activeTab = "Rules";
      this.overlay = "delete";
      return true;
    }

    // Tab-specific key handling
    if (this.activeTab === "Rules") {
      return this._handleRulesKey(key);
    }
    if (this.activeTab === "Drafts") {
      return this._handleDraftsKey(key);
    }
    if (this.activeTab === "Test") {
      return this._handleTestKey(key);
    }

    return false;
  }

  private async _handleRulesKey(key: string): Promise<boolean> {
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

  private async _handleDraftsKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      this.draftCursor = Math.min(this.draftCursor + 1, Math.max(0, this.drafts.length - 1));
      return true;
    }
    if (key === "k" || key === "\x1b[A") {
      this.draftCursor = Math.max(0, this.draftCursor - 1);
      return true;
    }
    if (key === "a" && this.selectedDraft?.draftId) {
      // Approve draft
      await this.opts.caller.routing.drafts.approve({ draftId: this.selectedDraft.draftId });
      this.drafts = this.drafts.filter((d) => d.draftId !== this.selectedDraft?.draftId);
      this.draftCursor = Math.min(this.draftCursor, Math.max(0, this.drafts.length - 1));
      return true;
    }
    if (key === "d" && this.selectedDraft?.draftId) {
      // Delete draft via overlay
      this.overlay = "delete";
      return true;
    }
    if (key === "t" && this.selectedDraft) {
      // Test with this draft as task facts
      this.decision = this.selectedDraft;
    }
    return false;
  }

  private async _handleTestKey(key: string): Promise<boolean> {
    if (key === "t") {
      this.overlay = "raw-json";
      this.rawJsonInput = "";
      this.rawJsonError = "";
      return true;
    }
    if (key === "r" && this.rawJsonInput) {
      try {
        const taskJson = JSON.parse(this.rawJsonInput);
        if (!taskJson || typeof taskJson !== "object" || Array.isArray(taskJson)) {
          this.rawJsonError = "Input must be a JSON object with task facts.";
          return true;
        }
        this.decision = await this.opts.caller.routing.dryRun({
          taskJson: {
            title: "TUI test",
            kind: taskJson.kind ?? "task",
            priority: taskJson.priority ?? "normal",
            tags: taskJson.tags ?? [],
            ...taskJson,
          },
        });
        this.rawJsonError = "";
      } catch {
        this.rawJsonError = "Invalid JSON input.";
      }
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
    if (this.activeTab === "Test") {
      this.decision = await this.opts.caller.routing.dryRun({ taskJson });
      this.overlay = "test";
    } else {
      this.activeTab = "Test";
      this.rawJsonInput = JSON.stringify(taskJson);
      this.decision = await this.opts.caller.routing.dryRun({ taskJson });
    }
  }

  // ── Visibility helpers ──────────────────────────────────────────────

  get visibleRules(): readonly TuiRoutingRule[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.rules.slice(this.scrollTop, this.scrollTop + rows);
  }

  get visibleDrafts(): readonly TuiEnrichedDecision[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.drafts.slice(0, rows);
  }

  private get selectedRule(): TuiRoutingRule | undefined {
    return this.rules[this.cursor];
  }

  private get selectedDraft(): TuiEnrichedDecision | undefined {
    return this.drafts[this.draftCursor];
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
      const target = this.activeTab === "Drafts"
        ? `draft ${this.selectedDraft?.draftId ?? ""}`
        : `rule ${this.selectedRule?.id ?? ""}`;
      renderer.writeln(c.red(`  Delete routing rule? ${target}`));
      renderer.writeln(c.dim("  Confirm? [y/N]"));
      return;
    }
    if (this.overlay === "test") {
      renderer.writeln(c.bold("  Test routing rule"));
      const row = this.selectedRule;
      if (row) {
        renderer.writeln(`  Conditions JSON: ${JSON.stringify(row.conditionsJson)}`);
      }
      return;
    }
    if (this.overlay === "raw-json") {
      renderer.writeln(c.bold("  Raw JSON Test Input"));
      renderer.writeln(c.dim("  Enter task facts (JSON object, press Enter to set, 'r' to run)"));
      if (this.rawJsonError) renderer.writeln(c.red(`  ${this.rawJsonError}`));
      return;
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
