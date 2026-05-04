/** Doc-links stub router — Pillar replacement pending. */

import { t } from "../trpc.ts";
import { listProcedure, mutationProcedure, idMutationProcedure } from "./stub-helpers.ts";

export const docLinksRouter = t.router({
  list: listProcedure(),
  create: mutationProcedure("doc_links", "create"),
  delete: idMutationProcedure("doc_links", "delete"),
});
