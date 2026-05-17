/** Repo-commits stub router — Pillar replacement pending. */

import { t } from "../trpc.ts";
import { listProcedure, getProcedure } from "./stub-helpers.ts";

export const repoCommitsRouter = t.router({
  list: listProcedure("repo_commits"),
  get: getProcedure("repo_commits"),
});
