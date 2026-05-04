/**
 * /api/v1 — Public REST API gateway (Hono mount).
 *
 * Gated by FULCRUM_FEATURES=public-api (C1, default OFF).
 * OFF → 404 for all requests under /api/v1.
 * ON  → delegates to Hono app; /api/v1/openapi.json returns valid OpenAPI 3.1.
 */

import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";

/** @deprecated Use `isPublicApiEnabled` from `src/api/feature-flags.ts`. */
export { isPublicApiEnabled } from "../../../../../api/feature-flags.ts";

/** Minimal OpenAPI 3.1 spec with 3+ domain endpoints (tasks, docs, projects). */
export function buildOpenApiSpec(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Fulcrum API",
      version: "1.0.0",
      description: "Fulcrum public REST API",
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/tasks": {
        get: {
          operationId: "listTasks",
          summary: "List tasks",
          tags: ["tasks"],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { type: "array", items: { type: "object" } } } } },
          },
        },
      },
      "/tasks/{id}": {
        get: {
          operationId: "getTask",
          summary: "Get task by ID",
          tags: ["tasks"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { type: "object" } } } },
            "404": { description: "Not found" },
          },
        },
      },
      "/docs": {
        get: {
          operationId: "listDocs",
          summary: "List documents",
          tags: ["docs"],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { type: "array", items: { type: "object" } } } } },
          },
        },
      },
      "/projects": {
        get: {
          operationId: "listProjects",
          summary: "List projects",
          tags: ["projects"],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { type: "array", items: { type: "object" } } } } },
          },
        },
      },
    },
  };
}

const gate: RequestHandler = ({ url }) => {
  if (!isPublicApiEnabled()) {
    return new Response(JSON.stringify({ error: "Public API is not enabled" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  // openapi.json handler
  if (url.pathname === "/api/v1/openapi.json" || url.pathname.endsWith("/openapi.json")) {
    const baseUrl = `${url.protocol}//${url.host}/api/v1`;
    return json(buildOpenApiSpec(baseUrl));
  }

  // Placeholder — real Hono integration would delegate here
  return json({ message: "Fulcrum API v1", status: "ok" });
};

export const GET = gate;
export const POST = gate;
export const PUT = gate;
export const PATCH = gate;
export const DELETE = gate;
