import type { EntityManager } from "@mikro-orm/postgresql";
import type { Org, User } from "../db/entities/auth/index.ts";
import { TelemetryEvent } from "../db/entities/platform/TelemetryEvent.ts";

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
  em: EntityManager;
  org: Org;
  user?: User | null;
}

export class DbTelemetrySink implements TuiTelemetrySink {
  constructor(private readonly opts: DbTelemetrySinkOptions) {}

  async recordRender(row: TuiRenderTelemetryRow): Promise<void> {
    const event = this.opts.em.create(TelemetryEvent, {
      org: this.opts.org,
      user: this.opts.user ?? undefined,
      kind: row.kind,
      payload: {
        screen_key: row.screenKey,
        route: row.route,
        render_ms: row.renderMs,
      },
      occurredAt: row.occurredAt,
    });
    this.opts.em.persist(event);
    await this.opts.em.flush();
  }
}
