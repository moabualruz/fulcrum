import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { TuiDocScope, TuiDocType } from "./docs-types.ts";

export interface DocsReaderEditorDoc {
  id: string;
  title: string;
  docType: TuiDocType | string;
  scope: TuiDocScope | string;
  projectId?: string | null;
  parentId?: string | null;
  body: string;
  updatedAt?: string;
}

export interface DocsReaderBacklink {
  id: string;
  title?: string;
  href?: string;
}

export interface DocsReaderComment {
  id: string;
  bodyMd?: string;
  body_md?: string;
  authorId?: string;
  author_id?: string;
  status?: string;
  resolved?: boolean;
}

export interface DocsReaderAttachment {
  id: string;
  fileName?: string;
  file_name?: string;
  mimeType?: string;
  mime_type?: string;
  sizeBytes?: number | string;
  size_bytes?: number | string;
}

export interface DocsReaderCollaborationState {
  id: string;
  provider: string;
  activeClientIds?: string[];
  active_client_ids?: string[];
}

export interface DocsReaderEditorScreenOptions {
  docId: string;
  caller: {
    docs: {
      get: (input: { id: string }) => Promise<DocsReaderEditorDoc>;
      listBacklinks?: (input: { docId: string }) => Promise<DocsReaderBacklink[]>;
      listComments?: (input: { docId: string }) => Promise<DocsReaderComment[]>;
      listAttachments?: (input: { docId: string }) => Promise<DocsReaderAttachment[]>;
      listCollaborationStates?: (input: { docId: string }) => Promise<DocsReaderCollaborationState[]>;
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
  private backlinks: DocsReaderBacklink[] = [];
  private comments: DocsReaderComment[] = [];
  private attachments: DocsReaderAttachment[] = [];
  private collaborationStates: DocsReaderCollaborationState[] = [];
  private mode: Mode = "reader";
  private bodyBuffer = "";

  constructor(private readonly opts: DocsReaderEditorScreenOptions) {}

  async load(): Promise<void> {
    this.doc = await this.opts.caller.docs.get({ id: this.opts.docId });
    const docId = this.doc.id;
    this.backlinks = await this.opts.caller.docs.listBacklinks?.({ docId }) ?? [];
    this.comments = await this.opts.caller.docs.listComments?.({ docId }) ?? [];
    this.attachments = await this.opts.caller.docs.listAttachments?.({ docId }) ?? [];
    this.collaborationStates = await this.opts.caller.docs.listCollaborationStates?.({ docId }) ?? [];
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
    this.renderMetadata(renderer);
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

  private renderMetadata(renderer: Renderer): void {
    if (
      this.backlinks.length === 0 &&
      this.comments.length === 0 &&
      this.attachments.length === 0 &&
      this.collaborationStates.length === 0
    ) {
      return;
    }

    renderer.writeln();
    renderer.writeln(c.bold("  Metadata"));
    if (this.backlinks.length > 0) {
      renderer.writeln(`  Backlinks: ${this.backlinks.map((link) => link.title ?? link.id).join(", ")}`);
    }
    if (this.comments.length > 0) {
      renderer.writeln("  Comments:");
      for (const comment of this.comments) {
        const body = comment.bodyMd ?? comment.body_md ?? "";
        const author = comment.authorId ?? comment.author_id ?? "unknown";
        const status = comment.resolved === true ? "resolved" : comment.status ?? "open";
        renderer.writeln(`    ${author} [${status}] ${body}`);
      }
    }
    if (this.attachments.length > 0) {
      renderer.writeln("  Attachments:");
      for (const attachment of this.attachments) {
        const fileName = attachment.fileName ?? attachment.file_name ?? attachment.id;
        const mimeType = attachment.mimeType ?? attachment.mime_type ?? "application/octet-stream";
        renderer.writeln(`    ${fileName}  ${mimeType}  ${formatBytes(attachment.sizeBytes ?? attachment.size_bytes ?? 0)}`);
      }
    }
    if (this.collaborationStates.length > 0) {
      renderer.writeln("  Collaboration:");
      for (const state of this.collaborationStates) {
        const clients = state.activeClientIds ?? state.active_client_ids ?? [];
        renderer.writeln(`    ${state.provider}  ${clients.length} clients`);
      }
    }
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

function formatBytes(value: number | string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  return `${(kib / 1024).toFixed(1)} MiB`;
}
