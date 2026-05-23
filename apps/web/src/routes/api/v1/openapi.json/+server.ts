/**
 * /api/v1/openapi.json: serves OpenAPI 3.1 spec when public-api flag ON.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { _isPublicApiEnabled, _buildOpenApiSpec } from "../+server.ts";

export const GET: RequestHandler = ({ url }) => {
  if (!_isPublicApiEnabled()) {
    return new Response(JSON.stringify({ error: "Public API is not enabled" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  const baseUrl = `${url.protocol}//${url.host}/api/v1`;
  return json(_buildOpenApiSpec(baseUrl));
};
