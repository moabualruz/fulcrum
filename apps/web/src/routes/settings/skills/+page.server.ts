import type { PageServerLoad } from "./$types";
import { createSkillSupplyApiCaller } from "@platform-core/interface/http/skill-supply-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

interface SkillSupplyRow {
  id: string;
  name: string;
  slug: string;
  source: "local" | "upstream";
  upstreamRepo?: string | null;
  upstreamRef?: string | null;
  version?: string | null;
  hash?: string | null;
  enabledAgents?: string[];
}

export const load: PageServerLoad = (event) => {
  const skillsApi = createSkillSupplyApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
  return {
    streamed: {
      data: (async () => {
        const rows = await skillsApi.fulcrumSkills.list() as SkillSupplyRow[];
        const skills = rows.map(toPageSkill);
        return { skills };
      })(),
    },
  };
};

function toPageSkill(skill: SkillSupplyRow) {
  return {
    id: skill.id,
    name: skill.name,
    slug: skill.slug,
    version: skill.version ?? "",
    source: skill.source,
    upstream_repo: skill.upstreamRepo ?? null,
    upstream_ref: skill.upstreamRef ?? null,
    content_hash: skill.hash ?? null,
    enabled_agents: skill.enabledAgents ?? [],
    upstream_conflict: null,
  };
}
