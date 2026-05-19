import type { RequestEvent, RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";

import {
  RoutingPublicApiController,
  RoutingPublicApiService,
} from "@execution-orchestration/interface/http/routing-public-api.controller.ts";
import { RoutingPublicStore } from "@execution-orchestration/infrastructure/database/routing-store.ts";

import { initDatabase } from "$lib/server/db";

type JsonRecord = Record<string, unknown>;

async function controller(): Promise<RoutingPublicApiController> {
  const db = await initDatabase();
  const featuresEnv =
    process.env["FULCRUM_E2E"] === "1"
      ? [process.env["FULCRUM_FEATURES"], "public-api"].filter(Boolean).join(",")
      : process.env["FULCRUM_FEATURES"];
  return new RoutingPublicApiController(
    new RoutingPublicApiService(
      { featuresEnv },
      new RoutingPublicStore(db.orm),
    ),
  );
}

async function body(request: Request): Promise<JsonRecord> {
  if (!request.body) return {};
  const parsed = await request.json().catch(() => ({}));
  return isRecord(parsed) ? parsed : {};
}

function query(url: URL): JsonRecord {
  return Object.fromEntries(url.searchParams.entries());
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function routePath(event: RequestEvent): string[] {
  return String(event.params.path ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function notFound() {
  return json({ error: "Routing API route not found." }, { status: 404 });
}

function errorResponse(cause: unknown) {
  const maybeHttp = cause as { getStatus?: () => number; getResponse?: () => unknown; message?: string };
  const status = typeof maybeHttp.getStatus === "function" ? maybeHttp.getStatus() : 500;
  const response = typeof maybeHttp.getResponse === "function" ? maybeHttp.getResponse() : null;
  if (isRecord(response)) return json(response, { status });
  return json({ message: maybeHttp.message ?? "Routing API request failed." }, { status });
}

async function dispatch(event: RequestEvent, method: "GET" | "POST") {
  const api = await controller();
  const path = routePath(event);

  try {
    if (method === "GET" && path[0] === "rules" && path.length === 1) {
      return json(await api.listRules(query(event.url) as never));
    }
    if (method === "GET" && path[0] === "rules" && path[1] && path.length === 2) {
      return json(await api.getRule({ id: path[1] } as never, query(event.url) as never));
    }
    if (method === "GET" && path[0] === "drafts" && path.length === 1) {
      return json(await api.listDrafts(query(event.url) as never));
    }

    const payload = await body(event.request);
    if (method === "POST" && path[0] === "rules" && path[1] === "create" && path.length === 2) {
      return json(await api.createRule(payload as never));
    }
    if (method === "POST" && path[0] === "rules" && path[1] && path[2] === "update" && path.length === 3) {
      return json(await api.updateRule({ id: path[1] } as never, payload as never));
    }
    if (method === "POST" && path[0] === "rules" && path[1] && path[2] === "delete" && path.length === 3) {
      return json(await api.deleteRule({ id: path[1] } as never, payload as never));
    }
    if (method === "POST" && path[0] === "dry-run" && path.length === 1) {
      return json(await api.dryRun(payload as never));
    }
    if (method === "POST" && path[0] === "test" && path.length === 1) {
      return json(await api.testTask(payload as never));
    }
    if (method === "POST" && path[0] === "config" && path[1] === "llm-gate" && path.length === 2) {
      return json(await api.updateLlmGate(payload as never));
    }
    if (method === "POST" && path[0] === "drafts" && path[1] && path[2] === "update" && path.length === 3) {
      return json(await api.updateDraft({ id: path[1] } as never, payload as never));
    }
    if (method === "POST" && path[0] === "drafts" && path[1] && path[2] === "approve" && path.length === 3) {
      return json(await api.approveDraft({ id: path[1] } as never, payload as never));
    }
    if (method === "POST" && path[0] === "drafts" && path[1] && path[2] === "delete" && path.length === 3) {
      return json(await api.deleteDraft({ id: path[1] } as never, payload as never));
    }

    return notFound();
  } catch (cause) {
    return errorResponse(cause);
  }
}

export const GET: RequestHandler = async (event) => dispatch(event, "GET");
export const POST: RequestHandler = async (event) => dispatch(event, "POST");
