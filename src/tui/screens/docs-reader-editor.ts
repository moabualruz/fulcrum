import type { DocType, Scope } from "../../db/entities/docs/enums.ts";
import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

export interface DocsReaderEditorDoc {
  id: string;
  title: string;
  docType: DocType | string;
  scope: Scope | string;
  projectId?: string | null;
  parentId?: string | null;
  body: string;
  updatedAt?: string;
}

export interface DocsReaderEditorScreenOptions {
  docId: string;
  caller: {
    docs: {
      get: (input: { id: string }) => Promise<DocsReaderEditorDoc>;
      update: (input: {
        id: string;
        title: string;
        docType: string;
        scope: string;
        projectId?: string | null;
        parentId?: string | null;
        body: string;
      }) => Promise<unknown>;
    };
  };
}

type Mode = "reader" | "editor";

export class DocsReaderEditorScreen {
  private doc: DocsReaderEditorDoc | null = null;
  private mode: Mode = "reader";
  private bodyBuffer = "";

  constructor(private readonly opts: DocsReaderEditorScreenOptions) {}

  async load(): Promise<void> {
    this.doc = await this.opts.caller.docs.get({ id: this.opts.docId });
    this.bodyBuffer = this.doc.body;
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold(`  Docs › ${this.doc?.title ?? this.opts.docId}`));
    renderer.separator();
    renderer.writeln();

    if (!this.doc) {
      renderer.writeln(c.dim("  Loading doc."));
      return;
    }

    if (this.mode === "editor") {
      this.renderEditor(renderer, this.doc);
      return;
    }

    for (const line of renderMarkdown(this.doc.body)) renderer.writeln(`  ${line}`);
    renderer.writeln();
    renderer.writeln(c.dim("  e edit  h history  q back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (!this.doc) return false;

    if (this.mode === "reader" && key === "e") {
      this.bodyBuffer = this.doc.body;
      this.mode = "editor";
      return true;
    }

    if (this.mode === "reader" && key === "h") {
      this.mode = "history" as any;
      return true;
    }

    if (this.mode === "editor" && (key === "q" || key === "\x1b")) {
      this.mode = "reader";
      return true;
    }

    if (this.mode === "editor" && key === "\x13") {
      await this.opts.caller.docs.update({
        id: this.doc.id,
        title: this.doc.title,
        docType: String(this.doc.docType),
        scope: String(this.doc.scope),
        projectId: this.doc.projectId ?? null,
        parentId: this.doc.parentId ?? null,
        body: this.bodyBuffer,
      });
      this.doc = { ...this.doc, body: this.bodyBuffer };
      this.mode = "reader";
      return true;
    }

    return false;
  }

  setEditorBody(body: string): void {
    this.bodyBuffer = body;
  }

  get editorBody(): string {
    return this.bodyBuffer;
  }

  private renderEditor(renderer: Renderer, doc: DocsReaderEditorDoc): void {
    renderer.writeln(`  title: ${doc.title}`);
    renderer.writeln(`  docType: ${doc.docType}`);
    renderer.writeln(`  scope: ${doc.scope}`);
    if (doc.projectId) renderer.writeln(`  projectId: ${doc.projectId}`);
    if (doc.parentId) renderer.writeln(`  parentId: ${doc.parentId}`);
    renderer.writeln("  ---");
    for (const line of this.bodyBuffer.split("\n")) renderer.writeln(`  ${line}`);
    renderer.writeln();
    renderer.writeln(c.dim("  Ctrl+S save  q cancel"));
  }
}

export function renderMarkdown(markdown: string): string[] {
  const out: string[] = [];
  const lines = markdown.split("\n");
  let inCode = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      out.push(c.cyan(line));
      continue;
    }

    if (line.trim() === "") {
      out.push("");
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      out.push(c.bold(heading[2] ?? ""));
      continue;
    }

    out.push(renderInlineMarkdown(line));
  }

  return out;
}

function renderInlineMarkdown(line: string): string {
  return line
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}
