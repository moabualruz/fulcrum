import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";

import type { DraftRow, EnrichedDecisionRow, LlmGateConfig, RoutingDecisionRow, RoutingRuleRow } from "./routing.types";

function getLlmGateConfig(): LlmGateConfig {
  const features = (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((f) => f.trim());
  const enabled = features.includes("router-llm");
  const rawMode = process.env["FULCRUM_LLM_INPUT_MODE"];
  const inputMode = rawMode === "task_facts" || rawMode === "task_plus_history" || rawMode === "full_context"
    ? rawMode
    : "full_context";
  return { enabled, inputMode };
}

interface RouteLocals {
  session: unknown;
}

export interface RoutingLoadEvent {
  locals: RouteLocals;
  fetch: typeof fetch;
  request: { headers: { get(name: string): string | null } };
  url: URL;
  params?: Record<string, string | undefined>;
}

export interface RoutingActionEvent extends RoutingLoadEvent {
  request: RoutingLoadEvent["request"] & { formData(): Promise<FormData> };
}

const ConditionsSchema = z.record(z.string(), z.unknown()).refine(
  (value) => "all" in value || "any" in value,
  "conditions_json must contain an all or any group.",
);

function baseUrl(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function unwrapTrpcData(body: unknown): unknown {
  return (
    (body as { result?: { data?: { json?: unknown } } })?.result?.data?.json ??
    (body as { result?: { data?: unknown } })?.result?.data ??
    body
  );
}

function extractTrpcError(body: unknown): string {
  const errorBody = (body as { error?: unknown })?.error;
  if (errorBody && typeof errorBody === "object") {
    const message = (errorBody as { message?: unknown; json?: { message?: unknown } }).message;
    const jsonMessage = (errorBody as { json?: { message?: unknown } }).json?.message;
    if (typeof message === "string") return message;
    if (typeof jsonMessage === "string") return jsonMessage;
  }
  return "Request failed";
}

async function trpcGet(
  fetchFn: typeof fetch,
  origin: string,
  procedure: string,
  input: unknown,
  cookie: string,
) {
  const encodedInput = encodeURIComponent(JSON.stringify(input ?? {}));
  const response = await fetchFn(`${origin}/api/trpc/${procedure}?input=${encodedInput}`, {
    method: "GET",
    credentials: "include",
    headers: { "content-type": "application/json", cookie },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractTrpcError(body));
  return unwrapTrpcData(body);
}

async function trpcPost(
  fetchFn: typeof fetch,
  origin: string,
  procedure: string,
  input: unknown,
  cookie: string,
) {
  const response = await fetchFn(`${origin}/api/trpc/${procedure}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ json: input }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractTrpcError(body));
  return unwrapTrpcData(body);
}

function requireSession(event: RoutingLoadEvent): void {
  if (!event.locals.session) throw redirect(302, "/auth/login");
}

function parseConditions(value: FormDataEntryValue | null) {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    const result = ConditionsSchema.safeParse(parsed);
    if (!result.success) {
      return { ok: false as const, error: `Invalid conditions_json: ${result.error.issues[0]?.message ?? "invalid JSON"}` };
    }
    return { ok: true as const, value: result.data };
  } catch (error) {
    return { ok: false as const, error: `Invalid conditions_json: ${String((error as Error).message ?? error)}` };
  }
}

export async function loadRoutingPage(event: RoutingLoadEvent, projectId: string | null) {
  requireSession(event);
  const origin = baseUrl(event.url);
  const cookie = event.request.headers.get("cookie") ?? "";

  const llmGateConfig = getLlmGateConfig();

  if (projectId) {
    const [projectRules, allRules, drafts] = await Promise.all([
      trpcGet(event.fetch, origin, "routing.list", { projectId }, cookie),
      trpcGet(event.fetch, origin, "routing.list", {}, cookie),
      trpcGet(event.fetch, origin, "routing.drafts.list", {}, cookie).catch(() => []),
    ]);
    return {
      projectId,
      rules: Array.isArray(projectRules) ? (projectRules as RoutingRuleRow[]) : [],
      inheritedRules: Array.isArray(allRules)
        ? (allRules as RoutingRuleRow[]).filter((rule) => rule.projectId === null)
        : [],
      drafts: Array.isArray(drafts) ? (drafts as DraftRow[]) : [],
      llmGateConfig,
    };
  }

  const [rules, drafts] = await Promise.all([
    trpcGet(event.fetch, origin, "routing.list", {}, cookie),
    trpcGet(event.fetch, origin, "routing.drafts.list", {}, cookie).catch(() => []),
  ]);
  return {
    projectId: null,
    rules: Array.isArray(rules) ? (rules as RoutingRuleRow[]).filter((rule) => rule.projectId === null) : [],
    inheritedRules: [],
    drafts: Array.isArray(drafts) ? (drafts as DraftRow[]) : [],
    llmGateConfig,
  };
}

export function routingActions(projectIdFromParams?: (event: RoutingActionEvent) => string | null) {
  const scopedProjectId = (event: RoutingActionEvent) => projectIdFromParams?.(event) ?? null;

  return {
    create: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      const conditions = parseConditions(form.get("conditionsJson"));
      if (!conditions.ok) return fail(400, { createError: conditions.error });

      const name = String(form.get("name") ?? "").trim();
      const actionAgent = String(form.get("actionAgent") ?? "").trim();
      if (!name || !actionAgent) return fail(400, { createError: "Rule name and agent are required." });

      try {
        await trpcPost(event.fetch, baseUrl(event.url), "routing.create", {
          projectId: scopedProjectId(event),
          name,
          actionAgent,
          conditionsJson: conditions.value,
          actionSkillSet: String(form.get("actionSkillSet") ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          priority: Number(form.get("priority") ?? "100"),
          enabled: form.get("enabled") !== "false",
          source: "manual",
        }, event.request.headers.get("cookie") ?? "");
        return { ok: true };
      } catch (error) {
        return fail(400, { createError: String((error as Error).message ?? error) });
      }
    },

    update: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      const id = String(form.get("id") ?? "");
      const conditionsEntry = form.get("conditionsJson");
      const input: Record<string, unknown> = { id };

      if (conditionsEntry !== null && String(conditionsEntry).trim()) {
        const conditions = parseConditions(conditionsEntry);
        if (!conditions.ok) return fail(400, { updateError: conditions.error, id });
        input["conditionsJson"] = conditions.value;
      }
      for (const [field, formName] of [["name", "name"], ["actionAgent", "actionAgent"]] as const) {
        const value = String(form.get(formName) ?? "").trim();
        if (value) input[field] = value;
      }

      try {
        await trpcPost(event.fetch, baseUrl(event.url), "routing.update", input, event.request.headers.get("cookie") ?? "");
        return { ok: true };
      } catch (error) {
        return fail(400, { updateError: String((error as Error).message ?? error), id });
      }
    },

    toggle: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      await trpcPost(event.fetch, baseUrl(event.url), "routing.update", {
        id: String(form.get("id") ?? ""),
        enabled: String(form.get("enabled")) === "true",
      }, event.request.headers.get("cookie") ?? "");
      return { ok: true };
    },

    reorder: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      const ids = String(form.get("orderedIds") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
      const start = 10;
      for (const [index, id] of ids.entries()) {
        await trpcPost(event.fetch, baseUrl(event.url), "routing.update", {
          id,
          priority: start + index * 10,
        }, event.request.headers.get("cookie") ?? "");
      }
      return { ok: true };
    },

    dryRun: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      try {
        const taskJson = JSON.parse(String(form.get("taskJson") ?? ""));
        if (scopedProjectId(event) && !taskJson.projectId) taskJson.projectId = scopedProjectId(event);
        const result = await trpcGet(
          event.fetch,
          baseUrl(event.url),
          "routing.dryRun",
          { taskJson },
          event.request.headers.get("cookie") ?? "",
        );
        return { ok: true, dryRunResult: result as RoutingDecisionRow | null };
      } catch (error) {
        return fail(400, { dryRunError: String((error as Error).message ?? error) });
      }
    },

    delete: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      await trpcPost(event.fetch, baseUrl(event.url), "routing.delete", {
        id: String(form.get("id") ?? ""),
      }, event.request.headers.get("cookie") ?? "");
      return { ok: true };
    },

    // ── New enriched test action (calls routing.test) ────────────────────

    test: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      try {
        const result = await trpcPost(
          event.fetch,
          baseUrl(event.url),
          "routing.test",
          { taskId: String(form.get("taskId") ?? "") },
          event.request.headers.get("cookie") ?? "",
        );
        return { ok: true, testResult: result as EnrichedDecisionRow };
      } catch (error) {
        return fail(400, { testError: String((error as Error).message ?? error) });
      }
    },

    // ── Draft actions (proxy to routing.drafts.* tRPC procedures) ────────

    draftList: async (event: RoutingActionEvent) => {
      requireSession(event);
      const origin = baseUrl(event.url);
      const cookie = event.request.headers.get("cookie") ?? "";
      try {
        const drafts = await trpcGet(event.fetch, origin, "routing.drafts.list", {}, cookie);
        return { ok: true, drafts: (drafts ?? []) as DraftRow[] };
      } catch (error) {
        return fail(400, { draftError: String((error as Error).message ?? error) });
      }
    },

    draftApprove: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      try {
        await trpcPost(
          event.fetch,
          baseUrl(event.url),
          "routing.drafts.approve",
          { draftId: String(form.get("draftId") ?? "") },
          event.request.headers.get("cookie") ?? "",
        );
        return { ok: true };
      } catch (error) {
        return fail(400, { draftError: String((error as Error).message ?? error) });
      }
    },

    draftDelete: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      try {
        await trpcPost(
          event.fetch,
          baseUrl(event.url),
          "routing.drafts.delete",
          { draftId: String(form.get("draftId") ?? "") },
          event.request.headers.get("cookie") ?? "",
        );
        return { ok: true };
      } catch (error) {
        return fail(400, { draftError: String((error as Error).message ?? error) });
      }
    },

    draftUpdate: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      const input: Record<string, unknown> = {
        draftId: String(form.get("draftId") ?? ""),
      };
      const conditionsEntry = form.get("conditionsJson");
      if (conditionsEntry && String(conditionsEntry).trim()) {
        input["conditionsJson"] = JSON.parse(String(conditionsEntry));
      }
      const actionAgent = String(form.get("actionAgent") ?? "").trim();
      if (actionAgent) input["actionAgent"] = actionAgent;
      try {
        await trpcPost(
          event.fetch,
          baseUrl(event.url),
          "routing.drafts.update",
          input,
          event.request.headers.get("cookie") ?? "",
        );
        return { ok: true };
      } catch (error) {
        return fail(400, { draftError: String((error as Error).message ?? error) });
      }
    },

    // ── LLM gate config action (proxies to routing.config.updateLlmGate) ──

    updateLlmGate: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      const input: Record<string, unknown> = {};
      const enabledStr = String(form.get("enabled") ?? "");
      if (enabledStr === "true" || enabledStr === "false") {
        input["enabled"] = enabledStr === "true";
      }
      const inputMode = String(form.get("inputMode") ?? "").trim();
      if (inputMode) input["inputMode"] = inputMode;
      try {
        await trpcPost(
          event.fetch,
          baseUrl(event.url),
          "routing.config.updateLlmGate",
          input,
          event.request.headers.get("cookie") ?? "",
        );
        return { ok: true };
      } catch (error) {
        return fail(400, { llmGateError: String((error as Error).message ?? error) });
      }
    },
  };
}
