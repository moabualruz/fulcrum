import type { EntityManager } from "@mikro-orm/postgresql";

import type { Org, User } from "../../db/entities/auth/index.ts";
import { TelemetryEvent } from "../../db/entities/platform/TelemetryEvent.ts";

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
  em.persist(event);
  await em.flush();
}
