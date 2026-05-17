import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

export interface TuiAgentProfile {
  id: string;
  label: string;
  capabilities: string[];
}

export interface AgentsScreenOptions {
  caller: {
    agents: {
      list: () => Promise<TuiAgentProfile[]>;
    };
    agent_runs: {
      create: (input: { projectId: string; taskId: string; agent: string }) => Promise<{ id: string; agent: string; status: string }>;
    };
  };
  viewportRows?: number;
}

type AgentsMode = "list" | "detail";
type AgentsOverlay = "none" | "dispatch";

export class AgentsScreen {
  private agents: TuiAgentProfile[] = [];
  private cursor = 0;
  private scrollTop = 0;
  private mode: AgentsMode = "list";
  private overlay: AgentsOverlay = "none";
  private lastRunId: string | null = null;

  constructor(private readonly opts: AgentsScreenOptions) {}

  async load(): Promise<void> {
    this.agents = await this.opts.caller.agents.list();
    this.clampCursor();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold(this.mode === "detail" ? `  Agent › ${this.selectedAgent?.id ?? ""}` : "  Agents"));
    renderer.separator();
    renderer.writeln();

    if (this.mode === "detail") {
      this.renderDetail(renderer);
    } else {
      this.renderList(renderer);
    }

    if (this.lastRunId) {
      renderer.writeln();
      renderer.writeln(c.green(`  Dispatched ${this.lastRunId}`));
    }

    renderer.writeln();
    renderer.writeln(c.dim("  j/k navigate  Enter detail  d dispatch  q back"));

    if (this.overlay === "dispatch") {
      renderer.writeln();
      renderer.writeln(c.bold("  Dispatch run"));
      renderer.writeln(c.dim("  project + task selectors"));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.agents.length - 1));
      this.keepCursorVisible();
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      this.keepCursorVisible();
      return true;
    }

    if (key === "\r") {
      if (!this.selectedAgent) return false;
      this.mode = "detail";
      return true;
    }

    if (key === "d") {
      if (!this.selectedAgent) return false;
      this.overlay = "dispatch";
      return true;
    }

    if (key === "q" && this.mode === "detail") {
      this.mode = "list";
      return true;
    }

    return false;
  }

  async submitDispatch(input: { projectId: string; taskId: string }): Promise<void> {
    const agent = this.selectedAgent;
    if (!agent) return;
    const run = await this.opts.caller.agent_runs.create({ ...input, agent: agent.id });
    this.lastRunId = run.id;
    this.overlay = "none";
  }

  get visibleAgents(): readonly TuiAgentProfile[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.agents.slice(this.scrollTop, this.scrollTop + rows);
  }

  private renderList(renderer: Renderer): void {
    if (this.visibleAgents.length === 0) {
      renderer.writeln(c.dim("  No agents registered."));
      return;
    }

    for (const agent of this.visibleAgents) {
      const index = this.agents.indexOf(agent);
      const pointer = index === this.cursor ? c.bold(">") : " ";
      renderer.writeln(`${pointer} ${agent.id}  ${agent.label}  ${agent.capabilities.join(", ")}`);
    }
  }

  private renderDetail(renderer: Renderer): void {
    const agent = this.selectedAgent;
    if (!agent) {
      renderer.writeln(c.dim("  No agent selected."));
      return;
    }

    renderer.infoRow("Agent", `${agent.label} (${agent.id})`);
    renderer.writeln();
    renderer.writeln(c.bold("  Capabilities"));
    for (const capability of agent.capabilities) renderer.writeln(`  - ${capability}`);
  }

  private get selectedAgent(): TuiAgentProfile | undefined {
    return this.agents[this.cursor];
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.agents.length - 1));
    this.keepCursorVisible();
  }

  private keepCursorVisible(): void {
    const rows = this.opts.viewportRows ?? 20;
    if (this.cursor < this.scrollTop) this.scrollTop = this.cursor;
    if (this.cursor >= this.scrollTop + rows) this.scrollTop = this.cursor - rows + 1;
  }
}
