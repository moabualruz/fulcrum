import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createArtifactApiForEvent } from "$lib/server/artifact-api";

export const GET: RequestHandler = async (event) => {
  const { params } = event;
  try {
    const download = await createArtifactApiForEvent(event).artifacts.download({ id: params.id }) as {
      contentBase64?: string | null;
      mime?: string | null;
      filename?: string | null;
      artifact?: { title?: string | null; filename?: string | null };
    };
    if (!download.contentBase64) throw error(404, "Artifact not found");
    const body = Uint8Array.from(Buffer.from(download.contentBase64, "base64"));
    const filename = download.filename ?? download.artifact?.filename ?? download.artifact?.title ?? params.id;
    return new Response(body, {
      headers: {
        "content-type": download.mime ?? "application/octet-stream",
        "content-disposition": `attachment; filename="${downloadFilename(filename)}"`,
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
