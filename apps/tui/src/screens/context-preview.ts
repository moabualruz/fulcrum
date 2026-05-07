import type { Renderer } from "../renderer.ts";
import { c, truncate } from "../renderer.ts";

type ContextPaneKey = "memories" | "linkedDocs" | "recentRuns" | "repoState";

interface ContextSlice {
  tokenCount: number;
  content: string;
}

interface ContextBundle {
  tokenBudget: number;
  tokenCount: number;
  slices: Record<string, ContextSlice | undefined>;
}

export interface ContextPreviewScreenOptions {
  taskId: string;
  caller: {
    context: {
      assemble: (input: { taskId: string }) => Promise<{ bundle: ContextBundle; snapshotId?: string }>;
    };
  };
}

const PANES: Array<{ key: ContextPaneKey; title: string }> = [
  { key: "memories", title: "Memories" },
  { key: "linkedDocs", title: "Linked docs" },
  { key: "recentRuns", title: "Recent transcripts" },
  { key: "repoState", title: "Repo state" },
];

export class ContextPreviewScreen {
  private bundle: ContextBundle | null = null;
  private snapshotId: string | null = null;

  constructor(private readonly opts: ContextPreviewScreenOptions) {}

  async load(): Promise<void> {
    const result = await this.opts.caller.context.assemble({ taskId: this.opts.taskId });
    this.bundle = result.bundle;
    this.snapshotId = result.snapshotId ?? null;
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Context preview"));
    renderer.separator();
    renderer.writeln();

    if (!this.bundle) {
      renderer.writeln(c.dim("  Loading context."));
      return;
    }

    const paneWidth = Math.max(24, Math.floor((renderer.width - 10) / 4));
    const renderedPanes = PANES.map((pane) => renderPane(this.bundle!, pane, paneWidth));
    const maxRows = Math.max(...renderedPanes.map((pane) => pane.length));

    for (let row = 0; row < maxRows; row++) {
      renderer.writeln(`  ${renderedPanes.map((pane) => pane[row] ?? " ".repeat(paneWidth)).join("  ")}`);
    }

    renderer.writeln();
    const snapshot = this.snapshotId ? `  snapshot ${this.snapshotId}` : "";
    renderer.statusBar(`${this.bundle.tokenCount}/${this.bundle.tokenBudget} tokens`, `r refresh${snapshot}`);
  }

  async handleKey(key: string): Promise<boolean> {
    if (key !== "r") return false;
    await this.load();
    return true;
  }
}

function renderPane(bundle: ContextBundle, pane: { key: ContextPaneKey; title: string }, width: number): string[] {
  const slice = bundle.slices[pane.key] ?? { tokenCount: 0, content: "" };
  const lines = [
    c.bold(`${pane.title} (${slice.tokenCount} tokens)`),
    "-".repeat(width),
    ...slice.content.split("\n").filter((line) => line.trim() !== "").slice(0, 8),
  ];
  return lines.map((line) => truncate(line, width).padEnd(width));
}
