import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  if (process.env["FULCRUM_E2E"] !== "1") {
    throw error(404, "Not found");
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.["action"];
  const orgId = process.env["FULCRUM_ORG_ID"] ?? "00000000-0000-0000-0000-000000000001";

  switch (action) {
    case "init":
      return json({
        orgId,
        home: process.env["FULCRUM_HOME"] ?? "",
      });
    case "cleanup":
      return json({ ok: true });
    case "seedProject":
    case "seedTask":
    case "seedDoc":
    case "seedArtifact":
    case "seedSearchKinds":
      throw error(410, "E2E fixture DB seeding moved to public API setup.");
    default:
      throw error(400, "Unknown E2E fixture action");
  }
};
