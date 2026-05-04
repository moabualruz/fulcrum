/** Connectors stub router — Pillar replacement pending. */

import { t } from "../trpc.ts";
import { listProcedure, getProcedure, mutationProcedure, idMutationProcedure } from "./stub-helpers.ts";

export const connectorsRouter = t.router({
  list: listProcedure(),
  get: getProcedure(),
  enable: mutationProcedure("connectors", "enable"),
  disable: idMutationProcedure("connectors", "disable"),
  sync: mutationProcedure("connectors", "sync"),
  runs: t.router({
    list: listProcedure(),
    get: getProcedure(),
  }),
});
