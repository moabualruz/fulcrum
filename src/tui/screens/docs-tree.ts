import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import { TUI_DOC_TYPES, type TuiDocScope, type TuiDocType } from "./docs-types.ts";

export interface DocsTreeItem {
  id: string;
  title: string;
  slug?: string;
  scope: TuiDocScope | string;
  projectId?: string | null;
  parentId?: string | null;
  docType: TuiDocType | string;
  updatedAt?: string;
}

export interface DocsTreeScreenOptions {
  projectId?: string;
  caller: {
    docs: {
      list: (input?: Record<string, unknown>) => Promise<DocsTreeItem[]>;
      tree?: (input: { scope: TuiDocScope; projectId?: string }) => Promise<DocsTreeItem[]>;
      create: (input: { title: string; docType: TuiDocType; scope: TuiDocScope; projectId?: string }) => Promise<DocsTreeItem>;
      delete?: (input: { id: string; hard: false }) => Promise<unknown>;
    };
  };
  onOpenDoc?: (id: string) => void;
}

type Mode = "tree" | "new-type" | "new-title";

export class DocsTreeScreen {
  private docs: DocsTreeItem[] = [];
  private cursor = 0;
  private mode: Mode = "tree";
  private typeCursor = 0;
  private readonly expanded = new Set<string>();
  private scope: TuiDocScope = "project";

  constructor(private readonly opts: DocsTreeScreenOptions) {}

  async load(): Promise<void> {
    this.docs = await this.fetchDocs();
    this.cursor = Math.min(this.cursor, Math.max(0, this.visibleRows.length - 1));
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Docs"));
    renderer.separator();
    renderer.writeln();

    if (this.mode === "new-type") {
      renderer.writeln(c.bold("  New doc type"));
      renderer.writeln();
      for (let i = 0; i < TUI_DOC_TYPES.length; i++) {
        const docType = TUI_DOC_TYPES[i]!;
        const selected = i === this.typeCursor;
        renderer.writeln(`  ${selected ? c.inverse("> " + docType) : "  " + docType}`);
      }
      renderer.writeln();
      renderer.writeln(c.dim("  j/k navigate  Enter select  q back"));
      return;
    }

    if (this.mode === "new-title") {
      renderer.writeln(c.bold("  New doc title"));
      renderer.writeln(c.dim(`  Type: ${TUI_DOC_TYPES[this.typeCursor] ?? TUI_DOC_TYPES[0]}`));
      renderer.writeln();
      renderer.writeln(c.dim("  submitNewDocTitle(title) in headless tests"));
      return;
    }

    if (this.opts.caller.docs.tree) {
      renderer.writeln(c.bold(`  ${this.scope === "project" ? "Project" : "Global"} Docs`));
      this.renderTree(renderer, this.scope);
    } else {
      renderer.writeln(c.bold("  Project Docs"));
      this.renderTree(renderer, "project");
      renderer.writeln();
      renderer.writeln(c.bold("  Global Docs"));
      this.renderTree(renderer, "global");
    }
    renderer.writeln();
    renderer.writeln(c.dim("  j/k move  Enter open  -> expand  <- collapse  n new doc  d archive  g scope"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (this.mode === "new-type") {
      if (key === "q" || key === "\x1b") {
        this.mode = "tree";
        return true;
      }
      if (key === "j" || key === "\x1b[B") {
        this.typeCursor = Math.min(this.typeCursor + 1, TUI_DOC_TYPES.length - 1);
        return true;
      }
      if (key === "k" || key === "\x1b[A") {
        this.typeCursor = Math.max(this.typeCursor - 1, 0);
        return true;
      }
      if (key === "\r" || key === "\n") {
        this.mode = "new-title";
        return true;
      }
      return false;
    }

    if (this.mode === "new-title") {
      if (key === "q" || key === "\x1b") {
        this.mode = "tree";
        return true;
      }
      return false;
    }

    if (key === "n") {
      this.mode = "new-type";
      this.typeCursor = 0;
      return true;
    }

    if (key === "g") {
      this.scope = this.scope === "project" ? "global" : "project";
      await this.load();
      return true;
    }

    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.visibleRows.length - 1));
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }

    const row = this.visibleRows[this.cursor];
    if (!row) return false;

    if (key === "\x1b[C") {
      if (this.childrenOf(row.doc.id).length > 0) this.expanded.add(row.doc.id);
      return true;
    }

    if (key === "\x1b[D") {
      this.expanded.delete(row.doc.id);
      return true;
    }

    if (key === "\r" || key === "\n") {
      this.opts.onOpenDoc?.(row.doc.id);
      return true;
    }

    if (key === "d" && this.opts.caller.docs.delete) {
      await this.opts.caller.docs.delete({ id: row.doc.id, hard: false });
      this.docs = this.docs.filter((doc) => doc.id !== row.doc.id);
      this.cursor = Math.min(this.cursor, Math.max(0, this.visibleRows.length - 1));
      return true;
    }

    return false;
  }

  async submitNewDocTitle(title: string): Promise<void> {
    const docType = TUI_DOC_TYPES[this.typeCursor] ?? TUI_DOC_TYPES[0];
    const input = {
      title,
      docType,
      scope: this.scope,
      ...(this.scope === "project" && this.opts.projectId ? { projectId: this.opts.projectId } : {}),
    };
    const created = await this.opts.caller.docs.create(input);
    this.docs = [created, ...this.docs];
    this.mode = "tree";
    this.cursor = 0;
  }

  get visibleRows(): Array<{ doc: DocsTreeItem; depth: number }> {
    return [...this.rowsFor("project"), ...this.rowsFor("global")];
  }

  private renderTree(renderer: Renderer, scope: TuiDocScope): void {
    const rows = this.rowsFor(scope);
    if (rows.length === 0) {
      renderer.writeln(c.dim("    No docs"));
      return;
    }

    for (const row of rows) {
      const globalIndex = this.visibleRows.findIndex((candidate) => candidate.doc.id === row.doc.id);
      const selected = globalIndex === this.cursor;
      const hasChildren = this.childrenOf(row.doc.id).length > 0;
      const marker = hasChildren ? (this.expanded.has(row.doc.id) ? "v" : ">") : " ";
      const indent = "  ".repeat(row.depth);
      const line = `    ${indent}${marker} ${row.doc.title}  [${row.doc.docType}]`;
      renderer.writeln(selected ? c.inverse(line) : line);
    }
  }

  private rowsFor(scope: TuiDocScope): Array<{ doc: DocsTreeItem; depth: number }> {
    const roots = this.docs
      .filter((doc) => doc.scope === scope && !doc.parentId && (scope === "global" || !this.opts.projectId || doc.projectId === this.opts.projectId))
      .sort(compareDocs);
    return roots.flatMap((doc) => this.flatten(doc, 0));
  }

  private flatten(doc: DocsTreeItem, depth: number): Array<{ doc: DocsTreeItem; depth: number }> {
    const rows = [{ doc, depth }];
    if (!this.expanded.has(doc.id)) return rows;
    for (const child of this.childrenOf(doc.id).sort(compareDocs)) rows.push(...this.flatten(child, depth + 1));
    return rows;
  }

  private childrenOf(parentId: string): DocsTreeItem[] {
    return this.docs.filter((doc) => doc.parentId === parentId);
  }

  private async fetchDocs(): Promise<DocsTreeItem[]> {
    if (this.opts.caller.docs.tree) {
      return this.opts.caller.docs.tree({
        scope: this.scope,
        ...(this.scope === "project" && this.opts.projectId ? { projectId: this.opts.projectId } : {}),
      });
    }
    return this.opts.caller.docs.list(this.opts.projectId ? { projectId: this.opts.projectId } : {});
  }
}

function compareDocs(a: DocsTreeItem, b: DocsTreeItem): number {
  return a.title.localeCompare(b.title);
}
