import type { RequestHandler } from "@sveltejs/kit";
import { requestAppScope } from "$lib/server/application-scope";
import {
  installSkill,
  upgradeSkill,
  upgradeAllSkills,
  uninstallSkill,
  updateEnabledAgents,
  resolveConflict,
} from "$lib/server/skills";

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: RequestHandler = async ({ request, locals }) => {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("invalid JSON body");
  }

  const action = payload.action as string | undefined;
  if (!action) return jsonError("action is required");

  const scope = await requestAppScope(locals);

  switch (action) {
    case "install": {
      const slug = payload.slug as string | undefined;
      if (!slug || slug.trim() === "") return jsonError("slug is required");
      const upstreamRepo = (payload.upstream_repo as string) || undefined;
      try {
        const skill = await installSkill(scope, { slug, upstreamRepo });
        return jsonOk(skill, 201);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "install failed";
        return jsonError(msg);
      }
    }

    case "upgrade": {
      const slug = payload.slug as string | undefined;
      if (!slug) return jsonError("slug is required");
      try {
        if (slug === "all") {
          const skills = await upgradeAllSkills(scope);
          return jsonOk(skills);
        }
        const skill = await upgradeSkill(scope, slug);
        return jsonOk(skill);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "upgrade failed";
        return jsonError(msg);
      }
    }

    case "uninstall": {
      const slug = payload.slug as string | undefined;
      if (!slug) return jsonError("slug is required");
      try {
        await uninstallSkill(scope, slug);
        return new Response(null, { status: 204 });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "uninstall failed";
        return jsonError(msg);
      }
    }

    case "update_enabled_agents": {
      const slug = payload.slug as string | undefined;
      const agents = payload.enabled_agents as string[] | undefined;
      if (!slug) return jsonError("slug is required");
      if (!Array.isArray(agents)) return jsonError("enabled_agents must be an array");
      try {
        const skill = await updateEnabledAgents(scope, slug, agents);
        return jsonOk(skill);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "update failed";
        return jsonError(msg);
      }
    }

    case "resolve_conflict": {
      const slug = payload.slug as string | undefined;
      const resolution = payload.resolution as string | undefined;
      if (!slug) return jsonError("slug is required");
      if (resolution !== "keep_local" && resolution !== "use_upstream") {
        return jsonError("resolution must be 'keep_local' or 'use_upstream'");
      }
      try {
        const skill = await resolveConflict(scope, { slug, resolution });
        return jsonOk(skill);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "resolve failed";
        return jsonError(msg);
      }
    }

    default:
      return jsonError(`unknown action: ${action}`);
  }
};
