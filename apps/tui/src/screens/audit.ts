import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface TuiAuditRow {
  id: string;
  kind?: string;
  subjectKind?: string;
  actor?: string | null;
  action?: string;
  verb?: string;
  at?: string | Date;
  createdAt?: string | Date;
  target?: string | null;
  subjectId?: string | null;
  [key: string]: unknown;
}

export interface AuditFilters {
  kind?: string;
  since?: string;
  until?: string;
  subjectKind?: string;
  verb?: string;
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  limit?: number;
  offset?: number;
}

export interface AuditQueryResult {
  items: TuiAuditRow[];
  total: number;
  limit: number;
  offset: number;
}

export type AuditExportResult =
  | { format: "json"; rows: TuiAuditRow[] }
  | { format: "csv"; csv: string }
  | { format: "json" | "csv"; content: string }
  | { jobId: string }
  | { ok: boolean };

export interface AuditExportInput extends AuditFilters {
  format?: "json" | "csv";
  path?: string;
}

export interface AuditLogScreenOptions {
  caller: {
    audit: {
      query: (input: AuditFilters) => Promise<AuditQueryResult | TuiAuditRow[]>;
      export: (input: AuditExportInput) => Promise<AuditExportResult>;
    };
  };
  cwd?: string;
  now?: () => Date;
}

export class AuditLogScreen {
  private filters: AuditFilters = {};
  private rows: TuiAuditRow[] = [];
  private cursor = 0;
  private lastExportPath: string | null = null;
  private overlay: "none" | "export" = "none";

  constructor(private readonly opts: AuditLogScreenOptions) {}

  async setFilters(filters: AuditFilters): Promise<void> {
    this.filters = { ...filters };
    await this.reload();
  }

  async setDateFilter(date: string): Promise<void> {
    const trimmed = date.trim();
    if (!trimmed) {
      this.filters = { ...this.filters, dateRange: undefined };
      await this.reload();
      return;
    }

    const from = new Date(`${trimmed}T00:00:00.000Z`);
    const to = new Date(`${trimmed}T23:59:59.999Z`);
    this.filters = { ...this.filters, dateRange: { from, to } };
    await this.reload();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Audit log"));
    renderer.separator();
    renderer.writeln(`  Filters: kind=${this.filters.subjectKind ?? "*"} date=${formatRange(this.filters.dateRange)}`);
    renderer.writeln();

    if (this.rows.length === 0) {
      renderer.writeln(c.dim("  No audit events."));
    } else {
      for (let i = 0; i < this.rows.length; i++) {
        const row = this.rows[i];
        if (!row) continue;
        const pointer = i === this.cursor ? c.bold(">") : " ";
        renderer.writeln(
          `${pointer} ${row.subjectKind ?? row.kind ?? "event"}  ${row.verb ?? row.action ?? "unknown"}  ${row.actor ?? "system"}  ${row.subjectId ?? row.target ?? row.id}  ${formatDate(row.createdAt ?? row.at ?? "")}`,
        );
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  E export JSON  j/k scroll  date filter narrows events  q back"));
    if (this.lastExportPath) renderer.writeln(c.dim(`  Exported ${this.lastExportPath}`));
    if (this.overlay === "export") {
      renderer.writeln();
      renderer.writeln(c.bold("  Export audit log"));
      renderer.writeln(c.dim("  Enter destination JSON path"));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "E") {
      if (this.opts.cwd) {
        await this.exportJson();
      } else {
        this.overlay = "export";
      }
      return true;
    }

    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.rows.length - 1));
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }

    return false;
  }

  async submitExportPath(path: string): Promise<void> {
    await this.exportJson(path);
    this.overlay = "none";
  }

  private async reload(): Promise<void> {
    const hasPaging = this.filters.limit !== undefined || this.filters.offset !== undefined || this.filters.dateRange !== undefined || this.filters.subjectKind !== undefined || this.filters.verb !== undefined;
    const result = await this.opts.caller.audit.query(hasPaging
      ? { ...this.filters, limit: this.filters.limit ?? 50, offset: this.filters.offset ?? 0 }
      : this.filters);
    this.rows = Array.isArray(result) ? result : result.items;
    this.cursor = Math.min(this.cursor, Math.max(0, this.rows.length - 1));
  }

  private async exportJson(path?: string): Promise<void> {
    const outputPath = path ?? join(this.opts.cwd ?? process.cwd(), `audit-${timestamp(this.opts.now?.() ?? new Date())}.json`);
    const input = path ? { ...this.filters, path } : { ...toTrpcFilters(this.filters), format: "json" as const };
    const result = await this.opts.caller.audit.export(input);
    if ("rows" in result) {
      await writeFile(outputPath, JSON.stringify(result.rows, dateReplacer, 2) + "\n", "utf8");
    } else if ("content" in result && result.format === "json") {
      await writeFile(outputPath, withTrailingNewline(result.content), "utf8");
    }
    this.lastExportPath = outputPath;
  }
}

function toTrpcFilters(filters: AuditFilters): AuditFilters {
  const next: AuditFilters = { ...filters };
  if (next.kind && !next.subjectKind) next.subjectKind = next.kind;
  if ((next.since || next.until) && !next.dateRange) {
    next.dateRange = {
      from: next.since ? new Date(next.since) : undefined,
      to: next.until ? new Date(next.until) : undefined,
    };
  }
  delete next.kind;
  delete next.since;
  delete next.until;
  return next;
}

function formatDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function formatRange(range: AuditFilters["dateRange"]): string {
  if (!range?.from && !range?.to) return "*";
  const from = range.from ? range.from.toISOString().slice(0, 10) : "*";
  const to = range.to ? range.to.toISOString().slice(0, 10) : "*";
  return `${from}..${to}`;
}

function timestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function dateReplacer(_key: string, value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function withTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
