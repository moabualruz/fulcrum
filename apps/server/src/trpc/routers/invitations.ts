/** Invitations stub router — Pillar replacement pending. */

import { t } from "../trpc.ts";
import { listProcedure, getProcedure, mutationProcedure, idMutationProcedure } from "./stub-helpers.ts";

export const invitationsRouter = t.router({
  list: listProcedure("invitations"),
  get: getProcedure("invitations"),
  create: mutationProcedure("invitations", "create"),
  revoke: idMutationProcedure("invitations", "revoke"),
});
