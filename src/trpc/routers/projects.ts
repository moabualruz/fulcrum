/** Projects stub router — Pillar replacement pending. */

import { z } from "zod";

import { t } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";
import { crudProcedures, IdInputSchema } from "./stub-helpers.ts";

export const projectsRouter = t.router({
  ...crudProcedures("projects"),
  stats: protectedProcedure
    .input(IdInputSchema)
    .output(z.record(z.string(), z.number()))
    .query(() => ({})),
});
