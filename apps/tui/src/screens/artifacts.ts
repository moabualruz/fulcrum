/**
 * Ship stage workbench: the TUI `:ship` workbench (DESIGN.md §3.1,
 * CLI-TUI-UX.md §6, IA-MAP.md §9; OD `tui-runs.html` `ship` screen).
 *
 * The Ship stage's release / artifact surface, re-homed under the shared
 * `StageWorkbench` shell so it carries the same `fulcrum · :ship · …` header,
 * StatusFooter strip, and empty/error contract as every other stage workbench.
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import { truncateWide } from "../utils/truncate.ts";
import { ModePicker, type WorkflowMode } from "../widgets/ModePicker.ts";
import {
  renderStageWorkbenchFooter,
  renderStageWorkbenchHeader,
  renderWorkbenchEmptyState,
  renderWorkbenchErrorFrame,
  type StageWorkbenchScope,
} from "./runs-screen.ts";

export interface TuiArtifact {
  id: string;
  filename?: string | null;
  mime?: string | null;
  projectId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  docId?: string | null;
  type?: string | null;
  kind?: string | null;
  path: string;
  sizeBytes?: number | string | bigint | null;
  archived?: boolean;
  pruned?: boolean;
  retentionStatus?: string | null;
  previewKind?: string | null;
  createdAt?: string | Date | null;
}

export type TuiArtifactPreview =
  | { kind: "text"; artifact: { id: string; filename: string; mime?: string | null; path: string }; language: string | null; content: string; truncated: boolean }
  | { kind: "image"; artifact: { id: string; filename: string; mime?: string | null; path: string }; srcPath: string; mime: string; alt: string }
  | { kind: "binary"; artifact: { id: string; filename: string; mime?: string | null; path: string }; hexHeader: string; bytesShown: number }
  | { id: string; type: string; content?: string | null }
  | null;

export interface TuiArtifactFilters {
  projectId?: string;
  runId?: string;
  taskId?: string;
  mime?: string;
  kind?: string;
  archived?: boolean;
}

export interface ArtifactsScreenOptions {
  caller: {
    artifacts: {
      list: (input?: TuiArtifactFilters) => Promise<TuiArtifact[]>;
      get: (input: { id: string }) => Promise<TuiArtifactPreview>;
      upload: (input: { path: string }) => Promise<TuiArtifact>;
      download: (input: { id: string; outPath: string }) => Promise<{ ok: boolean; path: string }>;
      archive: (input: { id: string }) => Promise<{ ok: boolean; id: string }>;
      delete: (input: { id: string }) => Promise<{ ok: boolean; id: string }>;
    };
  };
  projectId?: string;
  runId?: string;
  taskId?: string;
  homeDir?: string;
  viewportRows?: number;
  /** Project / branch label rendered in the workbench scope chrome. */
  projectLabel?: string;
  /** Active trace id rendered in the workbench footer. */
  traceId?: string | null;
  /** Healthy/total MCP servers rendered in the workbench footer. */
  mcp?: string | null;
}

type ArtifactOverlay = "none" | "upload" | "archive" | "delete" | "filter" | "detail";

export class ArtifactsScreen {
  private artifacts: TuiArtifact[] = [];
  private preview: TuiArtifactPreview = null;
  private cursor = 0;
  private scrollTop = 0;
  private overlay: ArtifactOverlay = "none";
  private filters: TuiArtifactFilters = {};
  private selectedIds = new Set<string>();
  private error: string | null = null;
  /** The focused artifact-row Step mode picker (✋ Manual / ▶ Play / 💬 Discuss / ⊞ AI Assist). */
  private readonly modePicker = new ModePicker({
    stepId: "artifact",
    onSelect: (mode) => {
      this.stepMode = mode;
    },
  });
  /** Last Step mode selected via the ModePicker row. */
  private stepMode: WorkflowMode = "manual";

  constructor(private readonly opts: ArtifactsScreenOptions) {}

  /** The Step mode currently selected on the focused artifact row (✋/▶/💬/⊞). */
  get currentStepMode(): WorkflowMode {
    return this.stepMode;
  }

  /** The OD stage-scope chrome for the Ship workbench. */
  private get scope(): StageWorkbenchScope {
    return {
      stage: "Ship",
      route: ":ship",
      purpose: "artifacts",
      project: this.opts.projectLabel ?? this.opts.projectId ?? null,
      detail: `${this.artifacts.length} artifacts`,
      agent: null,
      mcp: this.opts.mcp ?? null,
      traceId: this.opts.traceId ?? this.selectedArtifact?.runId ?? null,
    };
  }

  async load(): Promise<void> {
    try {
      this.artifacts = await this.opts.caller.artifacts.list(this.listInput());
      this.error = null;
      this.clampCursor();
      await this.loadPreview();
    } catch (err) {
      this.artifacts = [];
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  render(renderer: Renderer): void {
    renderStageWorkbenchHeader(renderer, this.scope);

    if (this.error) {
      renderWorkbenchErrorFrame(renderer, {
        what: "Artifacts feed failed to load.",
        next: this.error,
        traceId: this.opts.traceId,
      });
      renderStageWorkbenchFooter(renderer, this.scope);
      return;
    }

    if (this.artifacts.length === 0) {
      renderWorkbenchEmptyState(
        renderer,
        "No artifacts in this stage yet.",
        "Press u to upload a release artifact.",
      );
      renderer.writeln();
      renderer.writeln(c.dim("  u upload  f filter  q back"));
      renderStageWorkbenchFooter(renderer, this.scope);
      return;
    }

    {
      for (const artifact of this.visibleArtifacts) {
        const index = this.artifacts.indexOf(artifact);
        const pointer = index === this.cursor ? c.bold(">") : " ";
        const checked = this.selectedIds.has(artifact.id) ? "[x]" : "[ ]";
        const line = `${pointer} ${checked} ${displayName(artifact)}  [${mimeBadge(artifact)}]  ${attachmentBadge(artifact)}  ${retentionBadge(artifact)}  preview:${previewBadge(artifact)}  ${formatBytes(artifact.sizeBytes)}`;
        renderer.writeln(truncateWide(line, Math.max(20, renderer.width)));
      }
    }

    renderer.writeln();
    renderer.writeln(c.bold("  Preview"));
    if (this.selectedArtifact) {
      renderer.writeln(`  ${previewSummary(this.selectedArtifact)}`);
    }
    for (const line of this.previewLines) renderer.writeln(truncateWide(`  ${line}`, Math.max(20, renderer.width)));

    // ModePicker row for the focused artifact-row Step (acceptance: Step-bearing rows).
    renderer.writeln();
    renderer.writeln(
      truncateWide(
        `  ${c.dim("step modes")}  ${this.modePicker.render()}`,
        Math.max(20, renderer.width),
      ),
    );

    renderer.writeln();
    renderer.writeln(c.dim(truncateWide("  j/k navigate  u upload  d download  a archive  D delete  f filter  m mode  Enter preview  q back", Math.max(20, renderer.width))));

    if (this.overlay === "upload") {
      renderer.writeln();
      renderer.writeln(c.bold("  Upload artifact"));
      renderer.writeln(c.dim("  Enter source file path"));
    }

    if (this.overlay === "archive") {
      renderer.writeln();
      const targets = this.targetArtifacts;
      renderer.writeln(c.yellow(`  Archive ${targets.length === 1 ? displayName(targets[0]) : `${targets.length} artifacts`}?`));
      for (const artifact of targets) renderer.writeln(`  ${displayName(artifact)}`);
      renderer.writeln("  Confirm? [y/N]");
    }

    if (this.overlay === "delete") {
      renderer.writeln();
      renderer.writeln(c.red("  Delete artifact"));
      const targets = this.targetArtifacts;
      renderer.writeln(`  Delete ${targets.length === 1 ? displayName(targets[0]) : `${targets.length} artifacts`}?`);
      for (const artifact of targets) renderer.writeln(`  ${displayName(artifact)}`);
      renderer.writeln("  Confirm? [y/N]");
    }

    if (this.overlay === "filter") {
      renderer.writeln();
      renderer.writeln(c.bold("  Filter artifacts"));
      renderer.writeln(c.dim("  MIME / kind / project / archive / run filters"));
    }

    if (this.overlay === "detail") {
      renderer.writeln();
      renderer.writeln(c.bold(`  Detail ${displayName(this.selectedArtifact)}`));
    }

    renderStageWorkbenchFooter(renderer, this.scope);
  }

  async handleKey(key: string): Promise<boolean> {
    if (this.overlay === "archive" && key === "y") {
      const targets = this.targetArtifacts;
      if (targets.length === 0) return false;
      for (const artifact of targets) await this.opts.caller.artifacts.archive({ id: artifact.id });
      this.selectedIds.clear();
      this.overlay = "none";
      return true;
    }

    if (this.overlay === "delete" && key === "y") {
      const targets = this.targetArtifacts;
      if (targets.length === 0) return false;
      for (const artifact of targets) await this.opts.caller.artifacts.delete({ id: artifact.id });
      const ids = new Set(targets.map((artifact) => artifact.id));
      this.artifacts = this.artifacts.filter((item) => !ids.has(item.id));
      this.selectedIds.clear();
      this.overlay = "none";
      this.clampCursor();
      await this.loadPreview();
      return true;
    }

    if (this.overlay !== "none" && (key === "n" || key === "\x1b")) {
      this.overlay = "none";
      return true;
    }

    if (this.overlay === "none" && key === "m" && this.modePicker.handleKey(key)) return true;

    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.artifacts.length - 1));
      this.keepCursorVisible();
      await this.loadPreview();
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      this.keepCursorVisible();
      await this.loadPreview();
      return true;
    }

    if (key === "u") {
      this.overlay = "upload";
      return true;
    }

    if (key === "d") {
      if (!this.selectedArtifact) return false;
      await this.opts.caller.artifacts.download({
        id: this.selectedArtifact.id,
        outPath: `${this.opts.homeDir ?? process.env["HOME"] ?? "."}/Downloads/${displayName(this.selectedArtifact)}`,
      });
      return true;
    }

    if (key === "a") {
      if (this.targetArtifacts.length === 0) return false;
      this.overlay = "archive";
      return true;
    }

    if (key === "D") {
      if (this.targetArtifacts.length === 0) return false;
      this.overlay = "delete";
      return true;
    }

    if (key === "f") {
      this.overlay = "filter";
      return true;
    }

    if (key === "\r" || key === "\n") {
      if (!this.selectedArtifact) return false;
      this.overlay = "detail";
      return true;
    }

    if (key === " ") {
      const artifact = this.selectedArtifact;
      if (!artifact) return false;
      if (this.selectedIds.has(artifact.id)) this.selectedIds.delete(artifact.id);
      else this.selectedIds.add(artifact.id);
      return true;
    }

    return false;
  }

  async submitUploadPath(path: string): Promise<void> {
    const artifact = await this.opts.caller.artifacts.upload({ path });
    this.artifacts = [...this.artifacts, artifact];
    this.overlay = "none";
  }

  async submitFilters(filters: TuiArtifactFilters): Promise<void> {
    this.filters = { ...this.filters, ...filters };
    await this.load();
    this.overlay = "none";
  }

  get visibleArtifacts(): readonly TuiArtifact[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.artifacts.slice(this.scrollTop, this.scrollTop + rows);
  }

  private get selectedArtifact(): TuiArtifact | undefined {
    return this.artifacts[this.cursor];
  }

  private get targetArtifacts(): TuiArtifact[] {
    if (this.selectedIds.size > 0) return this.artifacts.filter((artifact) => this.selectedIds.has(artifact.id));
    return this.selectedArtifact ? [this.selectedArtifact] : [];
  }

  private get previewLines(): string[] {
    if (!this.preview) return [c.dim("No artifact selected.")];
    if ("kind" in this.preview && this.preview.kind === "text") return this.preview.content.split("\n").slice(0, 50);
    if ("kind" in this.preview && this.preview.kind === "image") return [c.dim(`[image: ${this.preview.mime}, ${this.preview.artifact.filename}]`)];
    if ("kind" in this.preview && this.preview.kind === "binary") return [`hex ${this.preview.hexHeader} (${this.preview.bytesShown}B)`];
    if ("type" in this.preview && this.preview.type === "text") return (this.preview.content ?? "").split("\n").slice(0, 50);
    return [c.dim("Preview unavailable for non-text artifact.")];
  }

  private async loadPreview(): Promise<void> {
    const artifact = this.selectedArtifact;
    this.preview = artifact ? await this.opts.caller.artifacts.get({ id: artifact.id }) : null;
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.artifacts.length - 1));
    this.keepCursorVisible();
  }

  private keepCursorVisible(): void {
    const rows = this.opts.viewportRows ?? 20;
    if (this.cursor < this.scrollTop) this.scrollTop = this.cursor;
    if (this.cursor >= this.scrollTop + rows) this.scrollTop = this.cursor - rows + 1;
  }

  private listInput(): TuiArtifactFilters {
    return {
      ...this.filters,
      ...(this.opts.projectId ? { projectId: this.opts.projectId } : {}),
      ...(this.opts.runId ? { runId: this.opts.runId } : {}),
      ...(this.opts.taskId ? { taskId: this.opts.taskId } : {}),
    };
  }
}

function displayName(artifact?: TuiArtifact): string {
  if (!artifact) return "artifact";
  return artifact.filename ?? artifact.path.split("/").at(-1) ?? artifact.id;
}

function mimeBadge(artifact: TuiArtifact): string {
  return artifact.mime ?? artifact.type ?? "application/octet-stream";
}

function attachmentBadge(artifact: TuiArtifact): string {
  if (artifact.taskId) return `task:${artifact.taskId}`;
  if (artifact.runId) return `run:${artifact.runId}`;
  if (artifact.docId) return `doc:${artifact.docId}`;
  return "unattached";
}

function retentionBadge(artifact: TuiArtifact): string {
  if (artifact.pruned) return "pruned";
  if (artifact.archived) return "archived";
  return artifact.retentionStatus ?? "active";
}

function previewBadge(artifact: TuiArtifact): string {
  if (artifact.previewKind) return artifact.previewKind;
  const mime = artifact.mime ?? "";
  const name = displayName(artifact);
  if (mime === "image/png") return "image";
  if (mime === "text/markdown" || name.endsWith(".md")) return "markdown";
  if (mime.startsWith("text/")) return "text";
  if (mime === "application/json" || mime === "application/javascript" || name.match(/\.(ts|tsx|js|jsx|css|html)$/)) return "code";
  return "download";
}

function previewSummary(artifact: TuiArtifact): string {
  return `preview=${previewBadge(artifact)} retention=${retentionBadge(artifact)} run=${artifact.runId ?? "-"} kind=${artifact.kind ?? artifact.type ?? "artifact"}`;
}

function formatBytes(sizeBytes?: number | string | bigint | null): string {
  if (sizeBytes == null) return "";
  const bytes = typeof sizeBytes === "bigint" ? Number(sizeBytes) : Number(sizeBytes);
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KiB`;
}
