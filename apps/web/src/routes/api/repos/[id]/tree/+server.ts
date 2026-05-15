import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requestAppScope } from "$lib/server/application-scope";
import { listTreeChildren } from "@integration-hub/application/repo-files/queries.ts";
import { AppError } from "@platform-core/domain/errors.ts";

/** GET /api/repos/:id/tree?branch=main&parent=src */
export const GET: RequestHandler = async ({ params, url, locals }) => {
  const branch = url.searchParams.get("branch") ?? "main";
  const parent = url.searchParams.get("parent"); // null = root

  try {
    const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
    const children = await listTreeChildren(em, ctx, params.id!, branch, parent);
    return json({ children });
  } catch (e) {
    if (e instanceof AppError && e.kind === "not_found") return json({ error: "repo not found" }, { status: 404 });
    throw e;
  }
};
