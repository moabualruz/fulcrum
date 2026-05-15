import { error, fail, redirect } from "@sveltejs/kit";
import { z } from "zod";

import { createRoutingApiCaller } from "@execution-orchestration/interface/http/routing-api-client.ts";
import type {
  DraftRow,
  EnrichedDecisionRow,
  LlmGateConfig,
  RoutingDecisionRow,
  RoutingRuleRow,
} from "./routing.types";

function getLlmGateConfig(): LlmGateConfig {
  const features = (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((f) => f.trim());
  const enabled = features.includes("router-llm");
  const rawMode = process.env["FULCRUM_LLM_INPUT_MODE"];
  const inputMode = rawMode === "task_facts" || rawMode === "task_plus_history" || rawMode === "full_context"
    ? rawMode
    : "full_context";
  return { enabled, inputMode };
}

interface RouteLocals {
  session: unknown;
  orgId?: string | null;
  userId?: string | null;
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

type RoutingCaller = ReturnType<typeof createRoutingApiCaller>["routing"];

const ConditionsSchema = z.record(z.string(), z.unknown()).refine(
  (value) => "all" in value || "any" in value,
  "conditions_json must contain an all or any group.",
);

function baseUrl(url: URL): string {
  return process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"] ?? `${url.protocol}//${url.host}`;
}

function cookieHeaders(event: RoutingLoadEvent | RoutingActionEvent): Record<string, string> {
  const cookie = event.request.headers.get("cookie");
  return cookie ? { cookie } : {};
}

function createRoutingCaller(event: RoutingLoadEvent | RoutingActionEvent): RoutingCaller | null {
  const orgId = event.locals.orgId ?? process.env["FULCRUM_ORG_ID"];
  const userId = event.locals.userId ?? process.env["FULCRUM_USER_ID"];
  if (!orgId || !userId) return null;

  return createRoutingApiCaller({
    baseUrl: baseUrl(event.url),
    orgId,
    userId,
    fetch: event.fetch,
    headers: cookieHeaders(event),
  }).routing;
}

function requireRoutingCaller(event: RoutingLoadEvent | RoutingActionEvent): RoutingCaller {
  const caller = createRoutingCaller(event);
  if (!caller) error(503, { message: "Routing API caller is not configured." });
  return caller;
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
  } catch (parseError) {
    return { ok: false as const, error: `Invalid conditions_json: ${String((parseError as Error).message ?? parseError)}` };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeRule(row: unknown): RoutingRuleRow | null {
  if (!isRecord(row) || typeof row.id !== "string" || typeof row.orgId !== "string") return null;
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: typeof row.projectId === "string" ? row.projectId : null,
    name: stringValue(row.name, "Untitled rule"),
    conditionsJson: isRecord(row.conditionsJson) ? row.conditionsJson : {},
    actionAgent: stringValue(row.actionAgent, ""),
    actionSkillSet: stringArray(row.actionSkillSet),
    priority: numberValue(row.priority, 100),
    enabled: booleanValue(row.enabled, true),
    source: row.source === "learned" || row.source === "imported" ? row.source : "manual",
    createdAt: stringValue(row.createdAt),
    updatedAt: stringValue(row.updatedAt),
  };
}

function proposedRuleText(row: Record<string, unknown>): string {
  const actions = isRecord(row.proposedActionsJson) ? row.proposedActionsJson : {};
  const actionAgent = stringValue(actions.actionAgent, "agent");
  const conditions = isRecord(row.proposedConditionsJson) ? row.proposedConditionsJson : {};
  return `Route matching work to ${actionAgent}: ${JSON.stringify(conditions)}`;
}

function normalizeDraft(row: unknown): DraftRow | null {
  if (!isRecord(row)) return null;
  const id = stringValue(row.id || row.draftId);
  const orgId = stringValue(row.orgId);
  if (!id || !orgId) return null;
  const status = stringValue(row.status, "review_needed");
  const matchedRuleIds = [
    ...stringArray(row.matchingActiveRuleIds),
    ...(typeof row.matchedRuleId === "string" ? [row.matchedRuleId] : []),
  ];
  return {
    id,
    orgId,
    proposedRule: stringValue(row.proposedRule, proposedRuleText(row)),
    source: stringValue(row.source, "learned"),
    confidence: typeof row.confidence === "number" ? row.confidence : null,
    conflictState: status === "conflict" || status === "abstained" ? status : "review_needed",
    matchingActiveRuleIds: matchedRuleIds,
    createdAt: stringValue(row.createdAt),
  };
}

function normalizeRules(rows: unknown): RoutingRuleRow[] {
  return Array.isArray(rows)
    ? rows.map(normalizeRule).filter((row): row is RoutingRuleRow => row !== null)
    : [];
}

function normalizeDrafts(rows: unknown): DraftRow[] {
  return Array.isArray(rows)
    ? rows.map(normalizeDraft).filter((row): row is DraftRow => row !== null)
    : [];
}

function normalizeDecision(row: unknown): RoutingDecisionRow | null {
  if (!isRecord(row)) return null;
  return {
    ruleId: typeof row.ruleId === "string"
      ? row.ruleId
      : typeof row.matchedRuleId === "string" ? row.matchedRuleId : null,
    source: stringValue(row.source, stringValue(row.status, "api")),
    agent: stringValue(row.agent),
    confidence: typeof row.confidence === "number" ? row.confidence : null,
  };
}

function normalizeEnrichedDecision(row: unknown): EnrichedDecisionRow {
  const record = isRecord(row) ? row : {};
  return {
    status: record.status === "matched" || record.status === "recommended" || record.status === "draft_created" || record.status === "conflict" || record.status === "abstained"
      ? record.status
      : "no_match",
    matchedRuleId: typeof record.matchedRuleId === "string" ? record.matchedRuleId : null,
    draftId: typeof record.draftId === "string" ? record.draftId : null,
    factsUsed: isRecord(record.factsUsed) ? record.factsUsed : {},
    confidence: typeof record.confidence === "number" ? record.confidence : null,
    backend: typeof record.backend === "string" ? record.backend : null,
    model: typeof record.model === "string" ? record.model : null,
    whyUnmatched: typeof record.whyUnmatched === "string" ? record.whyUnmatched : null,
    evidence: stringArray(record.evidence),
  };
}

function messageFromError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export async function loadRoutingPage(event: RoutingLoadEvent, projectId: string | null) {
  requireSession(event);
  const caller = requireRoutingCaller(event);
  const llmGateConfig = getLlmGateConfig();

  if (projectId) {
    const [projectRules, allRules, drafts] = await Promise.all([
      caller.list({ projectId }),
      caller.list({}),
      caller.listDrafts({}).catch(() => []),
    ]);
    return {
      projectId,
      rules: normalizeRules(projectRules),
      inheritedRules: normalizeRules(allRules).filter((rule) => rule.projectId === null),
      drafts: normalizeDrafts(drafts),
      llmGateConfig,
    };
  }

  const [rules, drafts] = await Promise.all([
    caller.list({}),
    caller.listDrafts({}).catch(() => []),
  ]);
  return {
    projectId: null,
    rules: normalizeRules(rules).filter((rule) => rule.projectId === null),
    inheritedRules: [],
    drafts: normalizeDrafts(drafts),
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
        await requireRoutingCaller(event).create({
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
        });
        return { ok: true };
      } catch (createError) {
        return fail(400, { createError: messageFromError(createError) });
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
        await requireRoutingCaller(event).update(input);
        return { ok: true };
      } catch (updateError) {
        return fail(400, { updateError: messageFromError(updateError), id });
      }
    },

    toggle: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      await requireRoutingCaller(event).update({
        id: String(form.get("id") ?? ""),
        enabled: String(form.get("enabled")) === "true",
      });
      return { ok: true };
    },

    reorder: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      const ids = String(form.get("orderedIds") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      const start = 10;
      const caller = requireRoutingCaller(event);
      for (const [index, id] of ids.entries()) {
        await caller.update({ id, priority: start + index * 10 });
      }
      return { ok: true };
    },

    dryRun: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      try {
        const taskJson = JSON.parse(String(form.get("taskJson") ?? ""));
        if (scopedProjectId(event) && !taskJson.projectId) taskJson.projectId = scopedProjectId(event);
        const result = await requireRoutingCaller(event).dryRun({ taskJson });
        return { ok: true, dryRunResult: normalizeDecision(result) };
      } catch (dryRunError) {
        return fail(400, { dryRunError: messageFromError(dryRunError) });
      }
    },

    delete: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      await requireRoutingCaller(event).delete({ id: String(form.get("id") ?? "") });
      return { ok: true };
    },

    test: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      try {
        const result = await requireRoutingCaller(event).test({
          taskId: String(form.get("taskId") ?? ""),
        });
        return { ok: true, testResult: normalizeEnrichedDecision(result) };
      } catch (testError) {
        return fail(400, { testError: messageFromError(testError) });
      }
    },

    draftList: async (event: RoutingActionEvent) => {
      requireSession(event);
      try {
        const drafts = await requireRoutingCaller(event).listDrafts({});
        return { ok: true, drafts: normalizeDrafts(drafts) };
      } catch (draftError) {
        return fail(400, { draftError: messageFromError(draftError) });
      }
    },

    draftApprove: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      try {
        await requireRoutingCaller(event).approveDraft({
          draftId: String(form.get("draftId") ?? ""),
        });
        return { ok: true };
      } catch (draftError) {
        return fail(400, { draftError: messageFromError(draftError) });
      }
    },

    draftDelete: async (event: RoutingActionEvent) => {
      requireSession(event);
      const form = await event.request.formData();
      try {
        await requireRoutingCaller(event).deleteDraft({
          draftId: String(form.get("draftId") ?? ""),
        });
        return { ok: true };
      } catch (draftError) {
        return fail(400, { draftError: messageFromError(draftError) });
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
        await requireRoutingCaller(event).updateDraft(input);
        return { ok: true };
      } catch (draftError) {
        return fail(400, { draftError: messageFromError(draftError) });
      }
    },

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
        await requireRoutingCaller(event).updateLlmGate(input);
        return { ok: true };
      } catch (llmGateError) {
        return fail(400, { llmGateError: messageFromError(llmGateError) });
      }
    },
  };
}
