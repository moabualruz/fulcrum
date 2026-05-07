import { error } from "@sveltejs/kit";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { RequestHandler } from "./$types";
import { requestAppScope } from "$lib/server/application-scope";
import { getArtifactDetail } from "../../../../../../application/artifacts/queries.ts";
import { assertArtifactPathInRoot, resolveArtifactStoreRoot } from "../../../../../../artifacts/storage.ts";

const require = createRequire(import.meta.url);
const { lookup } = require("mime-types") as { lookup: (filename: string) => string | false };

export const GET: RequestHandler = async ({ params, locals }) => {
  const { em, ctx } = await requestAppScope(locals);
  try {
    const artifact = await getArtifactDetail(em, ctx, params.id);
    if (!artifact.body_path) throw error(404, "Artifact not found");
    let safePath: string;
    try {
      safePath = assertArtifactPathInRoot(resolveArtifactStoreRoot(), artifact.body_path);
    } catch {
      throw error(404, "Artifact not found");
    }
    const body = await readFile(safePath);
    return new Response(body, {
      headers: {
        "content-type": artifact.mime ?? (lookup(artifact.title) || "application/octet-stream"),
        "content-disposition": `attachment; filename="${downloadFilename(artifact.title)}"`,
      },
    });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) throw err;
    throw error(404, "Artifact not found");
  }
};

function downloadFilename(title: string): string {
  return title.replaceAll('"', "").replaceAll("\n", "").replaceAll("\r", "");
}
