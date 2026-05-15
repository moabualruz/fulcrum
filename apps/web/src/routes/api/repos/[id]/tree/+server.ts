import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listRepositoryTreeChildren } from "@integration-hub/interface/repository-files.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import { requestRepositoryScope } from "../../../../repos/repository-request-scope";

/** GET /api/repos/:id/tree?branch=main&parent=src */
export const GET: RequestHandler = async ({ params, url, locals }) => {
  const branch = url.searchParams.get("branch") ?? "main";
  const parent = url.searchParams.get("parent"); // null = root

  try {
    const { em, ctx } = await requestRepositoryScope(locals, locals?.activeProjectId ?? null);
    const children = await listRepositoryTreeChildren(em, ctx, params.id!, branch, parent);
    return json({ children });
  } catch (e) {
    if (e instanceof AppError && e.kind === "not_found") return json({ error: "repo not found" }, { status: 404 });
    throw e;
  }
};
