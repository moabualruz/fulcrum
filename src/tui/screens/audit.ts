import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

export interface TuiAuditRow {
  id: string;
  kind: string;
  actor?: string | null;
  action: string;
  at: string | Date;
  target?: string | null;
}

export interface AuditFilters {
  kind?: string;
  since?: string;
  until?: string;
}

export interface AuditLogScreenOptions {
  caller: {
    audit: {
      query: (input: AuditFilters) => Promise<TuiAuditRow[]>;
      export: (input: AuditFilters & { path: string }) => Promise<{ ok: boolean }>;
    };
  };
}

export class AuditLogScreen {
  private filters: AuditFilters = {};
  private rows: TuiAuditRow[] = [];
  private overlay: "none" | "export" = "none";

  constructor(private readonly opts: AuditLogScreenOptions) {}

  async setFilters(filters: AuditFilters): Promise<void> {
    this.filters = { ...filters };
    this.rows = await this.opts.caller.audit.query(this.filters);
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Audit log"));
    renderer.separator();
    renderer.writeln(`  Filters: kind=${this.filters.kind ?? "*"} since=${this.filters.since ?? "*"} until=${this.filters.until ?? "*"}`);
    renderer.writeln();

    if (this.rows.length === 0) {
      renderer.writeln(c.dim("  No audit events."));
    } else {
      for (const row of this.rows) {
        renderer.writeln(`  ${row.kind}  ${row.action}  ${row.actor ?? "system"}  ${row.target ?? row.id}  ${formatDate(row.at)}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  E export  j/k scroll  q back"));

    if (this.overlay === "export") {
      renderer.writeln();
      renderer.writeln(c.bold("  Export audit log"));
      renderer.writeln(c.dim("  Enter destination JSON path"));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (key !== "E") return false;
    this.overlay = "export";
    return true;
  }

  async submitExportPath(path: string): Promise<void> {
    await this.opts.caller.audit.export({ ...this.filters, path });
    this.overlay = "none";
  }
}

function formatDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
