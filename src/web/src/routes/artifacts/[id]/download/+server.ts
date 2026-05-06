import { error } from "@sveltejs/kit";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { RequestHandler } from "./$types";
import { openDatabase, getDefaultOrgId } from "$lib/server/db";
import { readArtifactDetail } from "$lib/server/artifacts";
import { assertArtifactPathInRoot, resolveArtifactStoreRoot } from "../../../../../../artifacts/storage.ts";

const require = createRequire(import.meta.url);
const { lookup } = require("mime-types") as { lookup: (filename: string) => string | false };

export const GET: RequestHandler = async ({ params }) => {
  const db = await openDatabase();
  try {
    const orgId = await getDefaultOrgId(db);
    const artifact = await readArtifactDetail(db, { orgId, id: params.id });
    if (!artifact || !artifact.body_path) throw error(404, "Artifact not found");
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
  } finally {
    await db.close();
  }
};

function downloadFilename(title: string): string {
  return title.replaceAll('"', "").replaceAll("\n", "").replaceAll("\r", "");
}
