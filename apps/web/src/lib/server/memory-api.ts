import type { RequestEvent } from "@sveltejs/kit";
import { createMemoryApiCaller } from "@knowledge-workspace/interface/http/memory-api-client";
import { activeOrgId, cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

// Server treats the bearer token as the active org id. Default to the canonical
// local org so manual / dev sessions land in the same org as seeded data instead
// of an isolated "web-local" silo. Override with FULCRUM_API_TOKEN for prod.
const DEFAULT_MEMORY_API_TOKEN = "00000000-0000-0000-0000-000000000001";

type MemoryApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

export const MEMORY_SCOPES = ["project", "global", "task", "user"] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export interface WebMemoryRow {
  id: string;
  org_id: string;
  project_id: string | null;
  scope: MemoryScope;
  kind: string;
  key: string;
  body: string;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export function createMemoryApiForEvent(event: MemoryApiEvent) {
  return createMemoryApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    token: activeMemoryToken(),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}

export function memoryOrgId(event: MemoryApiEvent): string {
  return activeOrgId(event.locals);
}

export function toWebMemoryRow(memory: unknown, orgId: string): WebMemoryRow {
  const record = memory as Record<string, unknown>;
  const sourceRef = record["sourceRef"] && typeof record["sourceRef"] === "object"
    ? record["sourceRef"] as Record<string, unknown>
    : {};
  const global = record["global"] === true;
  return {
    id: String(record["id"]),
    org_id: typeof sourceRef["orgId"] === "string" ? sourceRef["orgId"] : orgId,
    project_id: typeof record["projectId"] === "string" ? record["projectId"] : null,
    scope: global ? "global" : "project",
    kind: String(record["kind"] ?? "note"),
    key: typeof sourceRef["key"] === "string" ? sourceRef["key"] : String(record["id"]),
    body: String(record["body"] ?? ""),
    source: typeof record["source"] === "string" ? record["source"] : null,
    created_at: isoString(record["createdAt"]),
    updated_at: isoString(record["updatedAt"]),
  };
}

function isoString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return new Date(0).toISOString();
}

function activeMemoryToken(): string {
  return process.env["FULCRUM_API_TOKEN"] ?? process.env["FULCRUM_PUBLIC_API_TOKEN"] ?? DEFAULT_MEMORY_API_TOKEN;
}
