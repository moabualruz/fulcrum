/** Doc-versions stub router — Pillar replacement pending. */

import { t } from "../trpc.ts";
import { listProcedure, getProcedure, idMutationProcedure } from "./stub-helpers.ts";

export const docVersionsRouter = t.router({
  list: listProcedure("doc_versions"),
  get: getProcedure("doc_versions"),
  restore: idMutationProcedure("doc_versions", "restore"),
});
