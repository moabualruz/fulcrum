import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { TenantSetting } from "../../../db/entities/TenantSetting.ts";
import { TelemetryEvent } from "../../../db/entities/platform/TelemetryEvent.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import type { AuthenticatedContext } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

export interface TelemetryWriteInput {
  orgId: string;
  userId: string | null;
  kind: string;
  payload: Record<string, unknown>;
}

export abstract class TelemetryStore {
  abstract getOptedIn(orgId?: string): Promise<boolean>;
  abstract setOptedIn(value: boolean, orgId?: string): Promise<void>;
  abstract count(orgId?: string): Promise<number>;
  abstract write(event: TelemetryWriteInput): Promise<void>;
  abstract purge(orgId?: string): Promise<number>;
  async recordAudit(_verb: "opted_in" | "opted_out" | "purged", _payload: Record<string, unknown>, _orgId?: string): Promise<void> {}
}

const TELEMETRY_OPT_IN_KEY = "telemetry.opted_in";

const EmptyInputSchema = z.object({}).default({});
const StatusOutputSchema = z.object({
  opted_in: z.boolean(),
  row_count: z.number().int().nonnegative(),
});
const OkOutputSchema = z.object({ ok: z.literal(true) });
const PurgeOutputSchema = z.object({
  ok: z.literal(true),
  deleted: z.number().int().nonnegative(),
});

function scrubPayloadValue(value: unknown): unknown {
  if (typeof value === "string") return null;
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) return value.map(scrubPayloadValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        scrubPayloadValue(child),
      ]),
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

  await store.write({
    orgId,
    userId,
    kind,
    payload: scrubTelemetryPayload(payload),
  });
  return true;
}

class MikroTelemetryStore extends TelemetryStore {
  constructor(private readonly ctx: AuthenticatedContext) {
    super();
  }

  private em() {
    if (!this.ctx.em) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Telemetry repository is not configured.",
      });
    }
    return this.ctx.em;
  }

  async getOptedIn(orgId = this.ctx.orgId): Promise<boolean> {
    const setting = await this.em().findOne(TenantSetting, { orgId, key: TELEMETRY_OPT_IN_KEY });
    return setting?.value === true;
  }

  async setOptedIn(value: boolean, orgId = this.ctx.orgId): Promise<void> {
    const em = this.em();
    const existing = await em.findOne(TenantSetting, { orgId, key: TELEMETRY_OPT_IN_KEY });
    if (existing) {
      existing.value = value;
      existing.updatedAt = new Date();
    } else {
      em.persist(em.create(TenantSetting, { orgId, key: TELEMETRY_OPT_IN_KEY, value }));
    }
    await em.flush();
  }

  async count(orgId = this.ctx.orgId): Promise<number> {
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
    em.persist(entity);
    await em.flush();
  }

  async purge(orgId = this.ctx.orgId): Promise<number> {
    const em = this.em();
    const rows = await em.find(TelemetryEvent, { org: orgId } as never);
    em.remove(rows);
    await em.flush();
    return rows.length;
  }
}

function storeFromContext(ctx: AuthenticatedContext): TelemetryStore {
  if (ctx.container?.has(TelemetryStore)) return ctx.container.get(TelemetryStore);
  return new MikroTelemetryStore(ctx);
}

export const telemetryRouter = t.router({
  status: permissionedProcedure({ resource: "telemetry", action: "status" })
    .input(EmptyInputSchema)
    .output(StatusOutputSchema)
    .query(async ({ ctx }) => {
      const store = storeFromContext(ctx);
      return {
        opted_in: await store.getOptedIn(ctx.orgId),
        row_count: await store.count(ctx.orgId),
      };
    }),

  optIn: permissionedProcedure({ resource: "telemetry", action: "optIn" })
    .input(EmptyInputSchema)
    .output(OkOutputSchema)
    .mutation(async ({ ctx }) => {
      const store = storeFromContext(ctx);
      await store.setOptedIn(true, ctx.orgId);
      await store.recordAudit("opted_in", { optedIn: true }, ctx.orgId);
      return { ok: true as const };
    }),

  optOut: permissionedProcedure({ resource: "telemetry", action: "optOut" })
    .input(EmptyInputSchema)
    .output(OkOutputSchema)
    .mutation(async ({ ctx }) => {
      const store = storeFromContext(ctx);
      await store.setOptedIn(false, ctx.orgId);
      await store.recordAudit("opted_out", { optedIn: false }, ctx.orgId);
      return { ok: true as const };
    }),

  purge: permissionedProcedure({ resource: "telemetry", action: "purge" })
    .input(EmptyInputSchema)
    .output(PurgeOutputSchema)
    .mutation(async ({ ctx }) => {
      const store = storeFromContext(ctx);
      const deleted = await store.purge(ctx.orgId);
      await store.recordAudit("purged", { deleted }, ctx.orgId);
      return { ok: true as const, deleted };
    }),
});
