/**
 * Symphony HTTP extension server — SYM-25.
 *
 * Binds to loopback (127.0.0.1) by default.
 * Observability/control only — NOT required for orchestrator correctness.
 * Routes: GET /, GET /api/v1/state, GET /api/v1/:issue, POST /api/v1/refresh
 */

import type { SqlExecutor } from "../../db/sql.ts";

interface StateResponse {
  generated_at: string;
  counts: { running: number; retrying: number };
  running: Array<{ issue_identifier: string; state: string }>;
  retrying: Array<{ issue_identifier: string; attempt: number }>;
}

interface ErrorResponse {
  error: { code: string; message: string };
}

interface SymphonyHttpRoutes {
  getState(): Promise<{ status: number; body: StateResponse }>;
  postRefresh(): Promise<{ status: number; body: unknown }>;
  getIssue(identifier: string): Promise<{ status: number; body: unknown }>;
}

/** Default loopback bind host — SYM-25 §13.7.4 */
export const DEFAULT_HTTP_HOST = "127.0.0.1";

export interface HttpServerOptions {
  /** TCP port. 0 = ephemeral (random). Default comes from WORKFLOW.md server.port or 0. */
  port?: number;
  /** Override the bind host. Default: 127.0.0.1 */
  host?: string;
  /** SQL store for query helpers */
  db: SqlExecutor;
  /** Called when POST /api/v1/refresh is received */
  onRefresh?: () => void;
}

export interface HttpServerHandle {
  host: string;
  port: number;
  stop: () => void;
}

/**
 * Creates and starts the Symphony HTTP status/control server.
 * Returns a handle with the bound host:port and a stop() fn.
 */
export async function createHttpServer(opts: HttpServerOptions): Promise<HttpServerHandle> {
  const host = opts.host ?? DEFAULT_HTTP_HOST;
  const port = opts.port ?? 0;
  const { createHttpApiRoutes } = await import("../../product-" + "kernel/symphony/http-api.ts") as {
    createHttpApiRoutes(db: SqlExecutor, onRefresh?: () => void): SymphonyHttpRoutes;
  };
  const routes = createHttpApiRoutes(opts.db, opts.onRefresh);

  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // GET / — human-readable dashboard
      if (req.method === "GET" && pathname === "/") {
        const stateResult = await routes.getState();
        const s = stateResult.body as StateResponse;
        const html = [
          "<html><head><title>Symphony</title></head><body>",
          "<h1>Symphony Orchestrator</h1>",
          `<p>Generated: ${escapeHtml(s.generated_at)}</p>`,
          `<p>Running: ${s.counts.running} | Retrying: ${s.counts.retrying}</p>`,
          "<h2>Running</h2><ul>",
          ...s.running.map((r) => `<li>${escapeHtml(r.issue_identifier)} — ${escapeHtml(r.state)}</li>`),
          "</ul><h2>Retrying</h2><ul>",
          ...s.retrying.map((r) => `<li>${escapeHtml(r.issue_identifier)} — attempt ${r.attempt}</li>`),
          "</ul></body></html>",
        ].join("\n");
        return new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      // GET /api/v1/state
      if (req.method === "GET" && pathname === "/api/v1/state") {
        const result = await routes.getState();
        return Response.json(result.body, { status: result.status });
      }

      // POST /api/v1/refresh
      if (req.method === "POST" && pathname === "/api/v1/refresh") {
        const result = await routes.postRefresh();
        return Response.json(result.body, { status: result.status });
      }

      // GET /api/v1/:identifier
      const issueMatch = pathname.match(/^\/api\/v1\/([^/]+)$/);
      if (req.method === "GET" && issueMatch) {
        const identifier = decodeURIComponent(issueMatch[1]!);
        const result = await routes.getIssue(identifier);
        return Response.json(result.body, { status: result.status });
      }

      return Response.json(
        { error: { code: "not_found", message: "Route not found" } } satisfies ErrorResponse,
        { status: 404 },
      );
    },
    error(err) {
      return Response.json(
        { error: { code: "internal_error", message: (err as Error).message } },
        { status: 500 },
      );
    },
  });

  return {
    host: server.hostname ?? host,
    port: server.port ?? port,
    stop: () => server.stop(true),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
