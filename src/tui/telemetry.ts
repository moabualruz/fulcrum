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
