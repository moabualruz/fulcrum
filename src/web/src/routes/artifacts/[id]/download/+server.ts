import { error } from "@sveltejs/kit";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { RequestHandler } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { readArtifactDetail } from "$lib/server/artifacts";

const require = createRequire(import.meta.url);
const { lookup } = require("mime-types") as { lookup: (filename: string) => string | false };

export const GET: RequestHandler = async ({ params }) => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    const artifact = await readArtifactDetail(db, { orgId, id: params.id });
    if (!artifact || !artifact.body_path) throw error(404, "Artifact not found");
    const body = await readFile(artifact.body_path);
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
