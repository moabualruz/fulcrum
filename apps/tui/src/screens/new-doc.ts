/**
 * TUI New Document screen: `n` keybinding from any nav screen.
 *
 * Flow:
 *   1. Loads doc templates from in-process tRPC caller.
 *   2. Shows a doc_type picker (j/k to navigate, Enter to select).
 *   3. After selection, shows template body in an editable textarea buffer.
 *   4. `s` saves (stub: wired when docs.create is implemented), `q` exits.
 *
 * Headless-testable via FakeTTY injection.
 * C4: TUI surface parity.
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { DocTemplateRow } from "@knowledge-workspace/interface/document-templates.ts";
import { TUI_DOC_TYPES } from "./docs-types.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewDocScreenOptions {
  /** The `docs` portion of the TuiCaller: i.e. `caller.docs`. */
  caller: {
    templates: {
      list: (input: Record<string, never>) => Promise<DocTemplateRow[]>;
    };
  };
  onExit?: () => void;
  onSave?: (docType: string, body: string) => void | Promise<void>;
}

type Phase = "pick-type" | "edit-body";

// ─── NewDocScreen ─────────────────────────────────────────────────────────────

export class NewDocScreen {
  private templates: Map<string, DocTemplateRow> = new Map();
  private phase: Phase = "pick-type";
  private typeCursor = 0;
  private selectedType: string = TUI_DOC_TYPES[0];
  private bodyBuffer = "";
  private loadError: string | null = null;

  constructor(
    private readonly renderer: Renderer,
    private readonly opts: NewDocScreenOptions,
  ) {}

  async load(): Promise<void> {
    this.loadError = null;
    const rows = await this.opts.caller.templates.list({} as Record<string, never>);
    for (const row of rows) {
      this.templates.set(row.docType, row);
    }
    this.selectedType = TUI_DOC_TYPES[0];
    this.bodyBuffer = this.templates.get(this.selectedType)?.bodyTemplate ?? "";
    this.typeCursor = 0;
  }

  setLoadError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.loadError = message || "Unknown template load error";
    this.templates.clear();
    this.phase = "pick-type";
    this.typeCursor = 0;
    this.selectedType = TUI_DOC_TYPES[0];
    this.bodyBuffer = "";
  }

  render(): void {
    const r = this.renderer;
    r.writeln();
    r.writeln(c.bold("  New Document"));
    r.separator();
    r.writeln();

    if (this.loadError) {
      r.writeln(c.yellow("  Template load failed"));
      r.writeln();
      r.writeln(`  ${this.loadError}`);
      r.writeln();
      r.writeln(c.dim("  q back"));
    } else if (this.phase === "pick-type") {
      r.writeln(c.dim("  Select doc type:"));
      r.writeln();
      for (let i = 0; i < TUI_DOC_TYPES.length; i++) {
        const dt = TUI_DOC_TYPES[i];
        if (!dt) continue;
        const selected = i === this.typeCursor;
        const prefix = selected ? c.bold("> ") : "  ";
        r.writeln(`${prefix}${selected ? c.bold(dt) : dt}`);
      }
      r.writeln();
      r.writeln(c.dim("  j/k navigate  Enter select  q back"));
    } else {
      r.writeln(c.dim(`  Doc type: ${c.bold(this.selectedType)}`));
      r.writeln();
      r.writeln(c.dim("  Template body:"));
      r.writeln();
      const lines = this.bodyBuffer.split("\n");
      for (const line of lines) {
        r.writeln(`  ${line}`);
      }
      r.writeln();
      r.writeln(c.dim("  s save  q back"));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "q" || key === "\x1b") {
      if (this.phase === "edit-body") {
        this.phase = "pick-type";
        return true;
      }
      this.opts.onExit?.();
      return true;
    }

    if (this.loadError) return false;

    if (this.phase === "pick-type") {
      if (key === "j" || key === "\x1b[B") {
        this.typeCursor = Math.min(this.typeCursor + 1, TUI_DOC_TYPES.length - 1);
        return true;
      }
      if (key === "k" || key === "\x1b[A") {
        this.typeCursor = Math.max(this.typeCursor - 1, 0);
        return true;
      }
      if (key === "\r" || key === "\n" || key === " ") {
        this.selectedType = TUI_DOC_TYPES[this.typeCursor] ?? TUI_DOC_TYPES[0];
        this.bodyBuffer = this.templates.get(this.selectedType)?.bodyTemplate ?? "";
        this.phase = "edit-body";
        return true;
      }
    }

    if (this.phase === "edit-body") {
      if (key === "s") {
        await this.opts.onSave?.(this.selectedType, this.bodyBuffer);
        return true;
      }
    }

    return false;
  }

  // ─── Accessors for tests ──────────────────────────────────────────────────

  get currentPhase(): Phase {
    return this.phase;
  }

  get currentBodyBuffer(): string {
    return this.bodyBuffer;
  }

  get currentType(): string {
    return this.selectedType;
  }
}
