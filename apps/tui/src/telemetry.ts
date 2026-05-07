import { recordTuiRenderTelemetry, type RecordTuiRenderTelemetryInput } from "@/application/telemetry/commands.ts";

export interface TuiRenderTelemetryRow {
  kind: "local_telemetry";
  screenKey: string;
  route: string;
  renderMs: number;
  occurredAt: Date;
}

export interface TuiTelemetrySink {
  recordRender(row: TuiRenderTelemetryRow): void | Promise<void>;
}

export class MemoryTelemetrySink implements TuiTelemetrySink {
  readonly rows: TuiRenderTelemetryRow[] = [];

  recordRender(row: TuiRenderTelemetryRow): void {
    this.rows.push(row);
  }
}

export class NullTelemetrySink implements TuiTelemetrySink {
  recordRender(_row: TuiRenderTelemetryRow): void {}
}

export interface DbTelemetrySinkOptions {
  em: Parameters<typeof recordTuiRenderTelemetry>[0];
  org: RecordTuiRenderTelemetryInput["org"];
  user?: RecordTuiRenderTelemetryInput["user"];
}

export class DbTelemetrySink implements TuiTelemetrySink {
  constructor(private readonly opts: DbTelemetrySinkOptions) {}

  async recordRender(row: TuiRenderTelemetryRow): Promise<void> {
    await recordTuiRenderTelemetry(this.opts.em, {
      org: this.opts.org,
      user: this.opts.user ?? null,
      kind: row.kind,
      screenKey: row.screenKey,
      route: row.route,
      renderMs: row.renderMs,
      occurredAt: row.occurredAt,
    });
  }
}
