import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

export interface TuiArtifact {
  id: string;
  runId?: string | null;
  type: string;
  path: string;
  sizeBytes?: number | null;
  createdAt?: string | Date | null;
}

export interface TuiArtifactContent {
  id: string;
  type: string;
  content?: string | null;
}

export interface ArtifactsScreenOptions {
  caller: {
    artifacts: {
      list: () => Promise<TuiArtifact[]>;
      get: (input: { id: string }) => Promise<TuiArtifactContent>;
      write: (input: { id: string; path: string }) => Promise<{ ok: boolean }>;
      delete: (input: { id: string }) => Promise<{ ok: boolean }>;
    };
  };
  viewportRows?: number;
}

type ArtifactOverlay = "none" | "write" | "delete";

export class ArtifactsScreen {
  private artifacts: TuiArtifact[] = [];
  private preview: TuiArtifactContent | null = null;
  private cursor = 0;
  private scrollTop = 0;
  private overlay: ArtifactOverlay = "none";

  constructor(private readonly opts: ArtifactsScreenOptions) {}

  async load(): Promise<void> {
    this.artifacts = await this.opts.caller.artifacts.list();
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
        renderer.writeln(`${pointer} ${artifact.path}  [${artifact.type}]  ${artifact.runId ?? "no run"}  ${formatBytes(artifact.sizeBytes)}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.bold("  Preview"));
    for (const line of this.previewLines) renderer.writeln(`  ${line}`);

    renderer.writeln();
    renderer.writeln(c.dim("  j/k navigate  w write  D delete  q back"));

    if (this.overlay === "write") {
      renderer.writeln();
      renderer.writeln(c.bold("  Write artifact"));
      renderer.writeln(c.dim("  Enter destination path"));
    }

    if (this.overlay === "delete") {
      renderer.writeln();
      renderer.writeln(c.red("  Delete artifact"));
      renderer.writeln("  Confirm? [y/N]");
    }
  }

  async handleKey(key: string): Promise<boolean> {
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

    if (key === "w") {
      if (!this.selectedArtifact) return false;
      this.overlay = "write";
      return true;
    }

    if (key === "D") {
      if (!this.selectedArtifact) return false;
      this.overlay = "delete";
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

    if (this.overlay === "delete" && (key === "n" || key === "\x1b")) {
      this.overlay = "none";
      return true;
    }

    return false;
  }

  async submitWritePath(path: string): Promise<void> {
    const artifact = this.selectedArtifact;
    if (!artifact) return;
    await this.opts.caller.artifacts.write({ id: artifact.id, path });
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
    if (this.preview.type !== "text") return [c.dim("Preview unavailable for non-text artifact.")];
    return (this.preview.content ?? "").split("\n").slice(0, 50);
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
}

function formatBytes(sizeBytes?: number | null): string {
  if (sizeBytes == null) return "";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  return `${Math.round(sizeBytes / 1024)} KiB`;
}
