import type { EntityManager } from "typeorm";

import { TenantSetting } from "@platform-core/infrastructure/application-database/entities/TenantSetting.ts";
import type { Org, User } from "@identity-access/infrastructure/database/entities/auth/index.ts";
import { TelemetryEvent } from "@platform-core/infrastructure/application-database/entities/platform/TelemetryEvent.ts";
import { writeOutboxEvent } from "@workflow-coordination/application/outbox.ts";

export interface RecordTuiRenderTelemetryInput {
  org: Org;
  user?: User | null;
  kind: "local_telemetry";
  screenKey: string;
  route: string;
  renderMs: number;
  occurredAt: Date;
}

export async function recordTuiRenderTelemetry(
  em: EntityManager,
  input: RecordTuiRenderTelemetryInput,
): Promise<void> {
  const event = em.create(TelemetryEvent, {
    org: input.org,
    user: input.user ?? undefined,
    kind: input.kind,
    payload: {
      screen_key: input.screenKey,
      route: input.route,
      render_ms: input.renderMs,
    },
    occurredAt: input.occurredAt,
  });
  await em.save(event);
}

export interface TelemetryWriteInput {
  orgId: string;
  userId: string | null;
  kind: string;
  payload: Record<string, unknown>;
}

export interface TelemetryContext {
  em: EntityManager | null;
  orgId: string;
  userId: string;
}

export abstract class TelemetryStore {
  abstract getOptedIn(orgId?: string): Promise<boolean>;
  abstract setOptedIn(value: boolean, orgId?: string): Promise<void>;
  abstract count(orgId?: string): Promise<number>;
  abstract write(event: TelemetryWriteInput): Promise<void>;
  abstract purge(orgId?: string): Promise<number>;
  async recordAudit(_verb: "opted_in" | "opted_out" | "purged", _payload: Record<string, unknown>, _orgId?: string): Promise<void> {}
}

export const TELEMETRY_OPT_IN_KEY = "telemetry.opted_in";

function requireTelemetryEm(context: TelemetryContext): EntityManager {
  if (!context.em) throw new Error("Telemetry repository is not configured.");
  return context.em;
}

export class MikroTelemetryStore extends TelemetryStore {
  constructor(private readonly context: TelemetryContext) {
    super();
  }

  private em(): EntityManager {
    return requireTelemetryEm(this.context);
  }

  async getOptedIn(orgId = this.context.orgId): Promise<boolean> {
    const setting = await this.em().findOne(TenantSetting, { where: { orgId, key: TELEMETRY_OPT_IN_KEY } as never });
    return setting?.value === true;
  }

  async setOptedIn(value: boolean, orgId = this.context.orgId): Promise<void> {
    const em = this.em();
    const existing = await em.findOne(TenantSetting, { where: { orgId, key: TELEMETRY_OPT_IN_KEY } as never });
    if (existing) {
      existing.value = value;
      existing.updatedAt = new Date();
    } else {
      await em.save(em.create(TenantSetting, { orgId, key: TELEMETRY_OPT_IN_KEY, value }));
    }
  }

  async count(orgId = this.context.orgId): Promise<number> {
    return this.em().count(TelemetryEvent, { org: orgId } as never);
  }

  async write(event: TelemetryWriteInput): Promise<void> {
    const em = this.em();
    const entity = em.create(TelemetryEvent, {
      org: event.orgId,
      user: event.userId,
      kind: event.kind,
      payload: event.payload,
    } as never);
    await em.save(entity);
  }

  async purge(orgId = this.context.orgId): Promise<number> {
    const em = this.em();
    const rows = await em.find(TelemetryEvent, { org: orgId } as never);
    em.remove(rows);
    return rows.length;
  }

  override async recordAudit(
    verb: "opted_in" | "opted_out" | "purged",
    payload: Record<string, unknown>,
    orgId = this.context.orgId,
  ): Promise<void> {
    await writeOutboxEvent(this.em(), {
      orgId,
      verb: `telemetry.${verb}`,
      subjectKind: "telemetry",
      subjectId: this.context.userId,
      payload,
    });
  }
}

function scrubPayloadValue(value: unknown): unknown {
  if (typeof value === "string") return null;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map(scrubPayloadValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, scrubPayloadValue(child)]),
    );
  }
  return null;
}

export function scrubTelemetryPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return scrubPayloadValue(payload) as Record<string, unknown>;
}

export async function writeTelemetryEvent(
  store: TelemetryStore,
  orgId: string,
  userId: string | null,
  kind: string,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  if (!(await store.getOptedIn(orgId))) return false;
  await store.write({ orgId, userId, kind, payload: scrubTelemetryPayload(payload) });
  return true;
}

export function createTelemetryStore(
  context: TelemetryContext,
  injected?: TelemetryStore | null,
): TelemetryStore {
  return injected ?? new MikroTelemetryStore(context);
}
