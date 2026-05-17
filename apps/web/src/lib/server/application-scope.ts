import { error } from "@sveltejs/kit";

import {
  resolveApplicationScope,
  type ApplicationPersistence,
  type ApplicationScopeInput,
} from "@platform-core/application/runtime/application-scope.ts";
import { initDatabase } from "./db";

interface WebApplicationScopeLocals {
  em?: ApplicationPersistence | null;
  orgId?: string | null;
  userId?: string | null;
}

let testScopeOverride: WebApplicationScopeLocals | null = null;

export function __setApplicationScopeForTest(scope: WebApplicationScopeLocals | null): () => void {
  const previous = testScopeOverride;
  testScopeOverride = scope;
  return () => {
    testScopeOverride = previous;
  };
}

export async function requestAppScope(
  locals?: WebApplicationScopeLocals,
  projectId?: string | null,
  taskId?: string | null,
  runId?: string | null,
) {
  const scope = locals?.em ? locals : testScopeOverride ?? locals;
  let em = scope?.em ?? null;
  if (!em) {
    const db = await initDatabase();
    em = db.em;
  }
  return await resolveApplicationScope(
    { ...scope, em } satisfies ApplicationScopeInput,
    projectId,
    taskId,
    runId,
  ).catch((err) => {
    if (err instanceof Error && err.message === "Application runtime unavailable") {
      throw error(500, err.message);
    }
    throw err;
  });
}
