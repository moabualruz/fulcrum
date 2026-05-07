/** Doctor router — lightweight API health check. */

import { z } from "zod";

import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import { EmptyInputSchema } from "./stub-helpers.ts";

export const doctorRouter = t.router({
  run: permissionedProcedure({ resource: "doctor", action: "run" })
    .input(EmptyInputSchema)
    .output(z.object({
      ok: z.boolean(),
      subsystem: z.literal("api"),
      requestId: z.string(),
    }))
    .query(({ ctx }) => ({
      ok: true,
      subsystem: "api" as const,
      requestId: ctx.requestId ?? "",
    })),
  subsystems: permissionedProcedure({ resource: "doctor", action: "subsystems" })
    .input(EmptyInputSchema)
    .output(z.array(z.string()))
    .query(() => ["api"]),
});
