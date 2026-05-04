/** Agent-runs stub router — Pillar replacement pending. */

import { t } from "../trpc.ts";
import { listProcedure, getProcedure, mutationProcedure, idMutationProcedure } from "./stub-helpers.ts";

export const agentRunsRouter = t.router({
  list: listProcedure(),
  get: getProcedure(),
  create: mutationProcedure("agent_runs", "create"),
  cancel: idMutationProcedure("agent_runs", "cancel"),
  retry: idMutationProcedure("agent_runs", "retry"),
});
