/** Custom-fields stub router — Pillar replacement pending. */

import { t } from "../trpc.ts";
import { listProcedure, mutationProcedure, idMutationProcedure } from "./stub-helpers.ts";

export const customFieldsRouter = t.router({
  list: listProcedure(),
  create: mutationProcedure("custom_fields", "create"),
  update: mutationProcedure("custom_fields", "update"),
  delete: idMutationProcedure("custom_fields", "delete"),
  reorder: mutationProcedure("custom_fields", "reorder"),
});
