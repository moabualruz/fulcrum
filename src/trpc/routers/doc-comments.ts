/** Doc-comments stub router — Pillar replacement pending. */

import { t } from "../trpc.ts";
import { listProcedure, mutationProcedure, idMutationProcedure } from "./stub-helpers.ts";

export const docCommentsRouter = t.router({
  list: listProcedure("doc_comments"),
  create: mutationProcedure("doc_comments", "create"),
  update: mutationProcedure("doc_comments", "update"),
  delete: idMutationProcedure("doc_comments", "delete"),
});
