import type { EntityManager } from "typeorm";
import type { AppContext } from "@work-management/application/tasks/types.ts";

export async function listAgentProfilesPageData(em: EntityManager, ctx: AppContext) {
  const queries = await import("@execution-orchestration/application/agents/queries.ts");
  return queries.listAgentProfilesPageData(em, ctx);
}

export async function getAgentProfilePageData(em: EntityManager, ctx: AppContext, name: string) {
  const queries = await import("@execution-orchestration/application/agents/queries.ts");
  return queries.getAgentProfilePageData(em, ctx, name);
}

export async function testProfile(em: EntityManager, orgId: string, name: string) {
  const queries = await import("@execution-orchestration/application/agents/queries.ts");
  return queries.testProfile(em, orgId, name);
}
