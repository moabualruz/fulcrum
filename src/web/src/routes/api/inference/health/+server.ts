import { json, type RequestHandler } from "@sveltejs/kit";
import { getHealth } from "$lib/server/inference-client";

/** GET /api/inference/health — proxies sidecar health for client-side polling */
export const GET: RequestHandler = async () => {
  try {
    const health = await getHealth();
    return json(health);
  } catch {
    return json({ status: "unreachable" }, { status: 503 });
  }
};
