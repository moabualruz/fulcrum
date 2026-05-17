import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  cleanupE2eFixtures,
  seedE2eArtifact,
  seedE2eDoc,
  seedE2eProject,
  seedE2eSearchKindsOrm,
  seedE2eTask,
} from "@workflow-coordination/interface/test-fixtures.ts";
import { getE2eFixtureContext } from "$lib/server/db";

export const POST: RequestHandler = async ({ request }) => {
  if (process.env["FULCRUM_E2E"] !== "1") {
    throw error(404, "Not found");
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.["action"];
  const { db, orgId } = await getE2eFixtureContext();

  switch (action) {
    case "init":
      return json({
        orgId,
        home: process.env["FULCRUM_HOME"] ?? "",
      });
    case "seedProject":
      return json(await seedE2eProject(db, orgId, string(body, "slug"), optionalString(body, "name")));
    case "seedTask":
      return json(await seedE2eTask(db, orgId, object(body, "input")));
    case "seedDoc":
      return json(await seedE2eDoc(db, orgId, object(body, "input")));
    case "seedArtifact":
      return json(await seedE2eArtifact(db, orgId, object(body, "input")));
    case "seedSearchKinds":
      return json(await seedE2eSearchKindsOrm(db.em, orgId, {
        common: string(body, "common"),
        kinds: stringArray(body, "kinds"),
      }));
    case "cleanup":
      await cleanupE2eFixtures(db, object(body, "input"));
      return json({ ok: true });
    default:
      throw error(400, "Unknown E2E fixture action");
  }
};

function object<T extends Record<string, unknown>>(body: Record<string, unknown>, key: string): T {
  const value = body[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw error(400, `Expected object field: ${key}`);
  }
  return value as T;
}

function string(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0) {
    throw error(400, `Expected string field: ${key}`);
  }
  return value;
}

function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw error(400, `Expected string field: ${key}`);
  return value;
}

function stringArray(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw error(400, `Expected string array field: ${key}`);
  }
  return value;
}
