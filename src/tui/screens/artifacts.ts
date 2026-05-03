import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

export interface TuiArtifact {
  id: string;
  filename?: string | null;
  mime?: string | null;
  projectId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  docId?: string | null;
  type?: string | null;
  path: string;
  sizeBytes?: number | string | bigint | null;
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
}

type ArtifactOverlay = "none" | "upload" | "archive" | "delete" | "filter" | "detail";

export class ArtifactsScreen {
  private artifacts: TuiArtifact[] = [];
  private preview: TuiArtifactPreview = null;
  private cursor = 0;
  private scrollTop = 0;
  private overlay: ArtifactOverlay = "none";
  private filters: TuiArtifactFilters = {};

  constructor(private readonly opts: ArtifactsScreenOptions) {}

  async load(): Promise<void> {
    this.artifacts = await this.opts.caller.artifacts.list(this.listInput());
    this.clampCursor();
    await this.loadPreview();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Artifacts"));
    renderer.separator();
    renderer.writeln();

    if (this.visibleArtifacts.length === 0) {
      renderer.writeln(c.dim("  No artifacts."));
    } else {
      for (const artifact of this.visibleArtifacts) {
        const index = this.artifacts.indexOf(artifact);
        const pointer = index === this.cursor ? c.bold(">") : " ";
        renderer.writeln(
          `${pointer} ${displayName(artifact)}  [${mimeBadge(artifact)}]  ${attachmentBadge(artifact)}  ${formatBytes(artifact.sizeBytes)}`,
        );
      }
    }

    renderer.writeln();
    renderer.writeln(c.bold("  Preview"));
    for (const line of this.previewLines) renderer.writeln(`  ${line}`);

    renderer.writeln();
    renderer.writeln(c.dim("  j/k navigate  u upload  d download  a archive  D delete  f filter  Enter preview  q back"));

    if (this.overlay === "upload") {
      renderer.writeln();
      renderer.writeln(c.bold("  Upload artifact"));
      renderer.writeln(c.dim("  Enter source file path"));
    }

    if (this.overlay === "archive") {
      renderer.writeln();
      renderer.writeln(c.yellow(`  Archive ${displayName(this.selectedArtifact)}?`));
      renderer.writeln("  Confirm? [y/N]");
    }

    if (this.overlay === "delete") {
      renderer.writeln();
      renderer.writeln(c.red("  Delete artifact"));
      renderer.writeln(`  Delete ${displayName(this.selectedArtifact)}?`);
      renderer.writeln("  Confirm? [y/N]");
    }

    if (this.overlay === "filter") {
      renderer.writeln();
      renderer.writeln(c.bold("  Filter artifacts"));
      renderer.writeln(c.dim("  MIME / project / run / task filters"));
    }

    if (this.overlay === "detail") {
      renderer.writeln();
      renderer.writeln(c.bold(`  Detail ${displayName(this.selectedArtifact)}`));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (this.overlay === "archive" && key === "y") {
      const artifact = this.selectedArtifact;
      if (!artifact) return false;
      await this.opts.caller.artifacts.archive({ id: artifact.id });
      this.overlay = "none";
      return true;
    }

    if (this.overlay === "delete" && key === "y") {
      const artifact = this.selectedArtifact;
      if (!artifact) return false;
      await this.opts.caller.artifacts.delete({ id: artifact.id });
      this.artifacts = this.artifacts.filter((item) => item.id !== artifact.id);
      this.overlay = "none";
      this.clampCursor();
      await this.loadPreview();
      return true;
    }

    if (this.overlay !== "none" && (key === "n" || key === "\x1b")) {
      this.overlay = "none";
      return true;
    }

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
      if (!this.selectedArtifact) return false;
      this.overlay = "archive";
      return true;
    }

    if (key === "D") {
      if (!this.selectedArtifact) return false;
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

function formatBytes(sizeBytes?: number | string | bigint | null): string {
  if (sizeBytes == null) return "";
  const bytes = typeof sizeBytes === "bigint" ? Number(sizeBytes) : Number(sizeBytes);
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KiB`;
}
