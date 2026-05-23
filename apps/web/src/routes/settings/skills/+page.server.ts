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

interface SkillSupplyConflictRow {
  slug: string;
  localHash: string;
  upstreamHash: string;
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
        const [rows, conflicts] = await Promise.all([
          skillsApi.fulcrumSkills.list() as Promise<SkillSupplyRow[]>,
          skillsApi.fulcrumSkills.conflicts.list() as Promise<SkillSupplyConflictRow[]>,
        ]);
        const conflictBySlug = new Map(conflicts.map((conflict) => [conflict.slug, conflict]));
        const skills = rows.map((skill) => toPageSkill(skill, conflictBySlug.get(skill.slug)));
        return { skills };
      })(),
    },
  };
};

function toPageSkill(skill: SkillSupplyRow, conflict?: SkillSupplyConflictRow) {
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
    upstream_conflict: conflict
      ? {
          local_content: conflict.localHash,
          upstream_content: conflict.upstreamHash,
          installed_skill: skill.slug,
          installed_version: skill.version ?? "v1",
          requested_skill: `${skill.slug}-candidate`,
          requested_version: "v2",
          reason: "Incompatible tool/API requirements between installed and requested skill versions.",
          alt_versions: ["v1.latest", "v2.compat"],
          recommended_resolution: "alt_version",
          force_safe: false,
          session_resolution: null,
        }
      : null,
  };
}
