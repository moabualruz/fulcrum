import type { RequestHandler } from "@sveltejs/kit";
import { createSkillSupplyApiForEvent } from "$lib/server/skill-supply-api";

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

export const POST: RequestHandler = async (event) => {
  const { request } = event;
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("invalid JSON body");
  }

  const action = payload.action as string | undefined;
  if (!action) return jsonError("action is required");

  const skills = createSkillSupplyApiForEvent(event).fulcrumSkills;

  switch (action) {
    case "install": {
      const slug = payload.slug as string | undefined;
      if (!slug || slug.trim() === "") return jsonError("slug is required");
      const upstreamRepo = (payload.upstream_repo as string) || undefined;
      try {
        const skill = await skills.install({ slug, upstreamRepo });
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
          return jsonOk(await skills.upgrade({ slug: "all" }));
        }
        const skill = await skills.upgrade({ slug });
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
        await skills.uninstall({ slug });
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
        const skill = await skills.sync({ slug, enabled_agents: agents });
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
      if (
        resolution !== "keep_local" &&
        resolution !== "use_upstream" &&
        resolution !== "force" &&
        resolution !== "alt_version" &&
        resolution !== "skip" &&
        resolution !== "upgrade_installed"
      ) {
        return jsonError("resolution must be keep_local, use_upstream, force, alt_version, skip, or upgrade_installed");
      }
      try {
        const skill = await skills.resolveConflict({
          slug,
          resolution,
          altVersion: payload.alt_version as string | undefined,
        });
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
