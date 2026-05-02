/**
 * Notifications sub-router stub — Pillar 13 (notifications + webhooks) replaces the body.
 *
 * list() returns [] until Pillar 13 wires ctx.container → NotificationRepository.
 * C8: needle-di Container pattern; repo resolved from ctx.container when available.
 */

import { t } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";

export const notificationsRouter = t.router({
  /** list — stub; Pillar 13 replaces with: await repo.find({ org: ctx.orgId }) */
  list: protectedProcedure.query(() => []),
});

export type NotificationsRouter = typeof notificationsRouter;
