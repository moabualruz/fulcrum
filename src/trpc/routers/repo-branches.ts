/** Repo-branches stub router — Pillar replacement pending. */

import { t } from "../trpc.ts";
import { listProcedure, getProcedure } from "./stub-helpers.ts";

export const repoBranchesRouter = t.router({
  list: listProcedure(),
  get: getProcedure(),
});
