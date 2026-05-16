/**
 * TUI caller factory — composes per-service HTTP API clients into the
 * unified TuiCaller shape expected by TuiApp.
 *
 * Replaces the previous in-process tRPC caller with pure HTTP fetch
 * calls against the NestJS REST API.
 */

import type { DiContainer } from "@platform-core/interface/runtime-container.ts";

import {
  buildCliTuiCallerContext,
  requireCliTuiSessionContext,
  resolveCliTuiSession,
} from "@fulcrum/server/session/local-session.ts";

import { createAuthApiCallerFromEnv } from "@identity-access/interface/http/auth-api-client.ts";
import { createFeatureExperimentApiCallerFromEnv } from "@platform-core/interface/http/feature-experiment-api-client.ts";
import { createTaskApiCallerFromEnv } from "@work-management/interface/http/task-api-client.ts";
import { createProjectApiCallerFromEnv } from "@work-management/interface/http/project-api-client.ts";
import { createSprintApiCallerFromEnv } from "@work-management/interface/http/sprint-api-client.ts";
import { createRepositoryApiCallerFromEnv } from "@integration-hub/interface/http/repository-api-client.ts";
import { createMemoryApiCallerFromEnv } from "@knowledge-workspace/interface/http/memory-api-client.ts";
import { createSearchApiCallerFromEnv } from "@knowledge-workspace/interface/http/search-api-client.ts";
import { createInferenceApiCallerFromEnv } from "@platform-core/interface/http/inference-api-client.ts";
import { createRoutingApiCallerFromEnv } from "@execution-orchestration/interface/http/routing-api-client.ts";
import { createArtifactApiCallerFromEnv } from "@workflow-coordination/interface/http/artifact-api-client.ts";
import { createDocumentApiCallerFromEnv } from "@knowledge-workspace/interface/http/document-api-client.ts";
import { createAgentRunApiCallerFromEnv } from "@execution-orchestration/interface/http/agent-run-api-client.ts";
import { createNotificationApiCallerFromEnv } from "@notification-center/interface/http/notification-api-client.ts";
import { createAuditApiClientFromEnv } from "@workflow-coordination/interface/http/audit-api-client.ts";
import { createWebhookApiCallerFromEnv } from "@integration-hub/interface/http/webhook-api-client.ts";
import { createWorkflowApiCallerFromEnv } from "@workflow-coordination/interface/http/workflow-api-client.ts";

export { buildCliTuiCallerContext, requireCliTuiSessionContext } from "@fulcrum/server/session/local-session.ts";
export type { CliTuiCallerContext, CliTuiSession } from "@fulcrum/server/session/local-session.ts";

interface ApiEnv {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_API_TOKEN?: string;
  FULCRUM_PUBLIC_API_TOKEN?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

/**
 * Build the unified TUI caller by composing all per-service HTTP API clients.
 *
 * Session is resolved from the local DataSource so that the caller can
 * inject orgId/userId into scoped API client options.
 */
export async function createTuiHttpCaller(options: {
  container?: DiContainer | null;
  userAgent?: string;
  env?: ApiEnv;
  fetch?: typeof fetch;
} = {}) {
  const env = (options.env ?? process.env) as ApiEnv;
  const fetchFn = options.fetch;

  // Resolve session from local DB to get orgId/userId for scoped API calls.
  const cliContext = await buildCliTuiCallerContext(options.container ?? null);
  const session = await resolveCliTuiSession(cliContext.em, options.userAgent ?? "fulcrum-tui");

  // Build an enriched env with session-derived values so per-service
  // callers can scope to the correct org/user.
  const scopedEnv: ApiEnv = {
    ...env,
    FULCRUM_ORG_ID: env.FULCRUM_ORG_ID ?? session?.activeOrganizationId ?? session?.orgId,
    FULCRUM_USER_ID: env.FULCRUM_USER_ID ?? session?.userId,
    FULCRUM_API_TOKEN: env.FULCRUM_API_TOKEN ?? session?.token,
  };

  // Compose all per-service HTTP API clients into a single caller object.
  const auth = createAuthApiCallerFromEnv(scopedEnv, fetchFn);
  const flags = createFeatureExperimentApiCallerFromEnv(scopedEnv, fetchFn);
  const tasks = createTaskApiCallerFromEnv(scopedEnv, fetchFn);
  const projects = createProjectApiCallerFromEnv(scopedEnv, fetchFn);
  const sprints = createSprintApiCallerFromEnv(scopedEnv, fetchFn);
  const repos = createRepositoryApiCallerFromEnv(scopedEnv, fetchFn);
  const memories = createMemoryApiCallerFromEnv(scopedEnv, fetchFn);
  const search = createSearchApiCallerFromEnv(scopedEnv, fetchFn);
  const inference = createInferenceApiCallerFromEnv(scopedEnv, fetchFn);
  const routing = createRoutingApiCallerFromEnv(scopedEnv, fetchFn);
  const artifacts = createArtifactApiCallerFromEnv(scopedEnv, fetchFn);
  const docs = createDocumentApiCallerFromEnv(scopedEnv, fetchFn);
  const agentRuns = createAgentRunApiCallerFromEnv(scopedEnv, fetchFn);
  const notifications = createNotificationApiCallerFromEnv(scopedEnv, fetchFn);
  const audit = createAuditApiClientFromEnv(scopedEnv, fetchFn);
  const webhooks = createWebhookApiCallerFromEnv(scopedEnv, fetchFn);
  const workflow = createWorkflowApiCallerFromEnv(scopedEnv, fetchFn);

  return {
    // Required namespaces.
    ...(auth ? auth : {}),
    ...(flags ? flags : {}),
    // Optional namespaces — spread only if the API client was created
    // (i.e. env had FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL).
    ...(tasks ? tasks : {}),
    ...(projects ? projects : {}),
    ...(sprints ? sprints : {}),
    ...(repos ? repos : {}),
    ...(memories ? memories : {}),
    ...(search ? search : {}),
    ...(inference ? inference : {}),
    ...(routing ? routing : {}),
    ...(artifacts ? artifacts : {}),
    ...(docs ? docs : {}),
    ...(agentRuns ? agentRuns : {}),
    ...(notifications ? { notify: notifications.notify } : {}),
    ...(audit ? { audit } : {}),
    ...(webhooks ? webhooks : {}),
    // Workflow coordination overlays: planning, tasks extras, workflows.
    ...(workflow ? {
      planning: {
        ...(workflow.planning ?? {}),
      },
      tasks: {
        // Merge base tasks with workflow-coordination task extras
        // (dependency runs, QA reviews).
        ...((tasks ? tasks.tasks : {}) as Record<string, unknown>),
        ...(workflow.tasks ?? {}),
      },
      workflows: {
        ...(workflow.workflows ?? {}),
      },
    } : {}),
  };
}

/**
 * @deprecated Use createTuiHttpCaller instead. Kept as alias during migration.
 */
export const createTuiLocalCaller = createTuiHttpCaller;

export function requireTuiSessionContext(options: {
  container?: DiContainer | null;
  userAgent?: string;
} = {}) {
  return requireCliTuiSessionContext(options);
}

// ---------------------------------------------------------------------------
// Overlay helpers — compose a per-service HTTP API client into an existing
// caller object. Used by buildCaller internals and tests.
// ---------------------------------------------------------------------------

type ConfiguredApiCaller<T extends (...args: never[]) => unknown> = Exclude<ReturnType<T>, null>;
type MergedCaller<Base extends object, Overlay extends object> = Omit<Base, keyof Overlay> & Overlay;
type NestedMerge<Base, Overlay extends object> = Base extends object ? Omit<Base, keyof Overlay> & Overlay : Overlay;
type NotificationApiCaller = ConfiguredApiCaller<typeof createNotificationApiCallerFromEnv>;
type DocumentApiCaller = ConfiguredApiCaller<typeof createDocumentApiCallerFromEnv>;
type AgentRunApiCaller = ConfiguredApiCaller<typeof createAgentRunApiCallerFromEnv>;
type WebhookApiCaller = ConfiguredApiCaller<typeof createWebhookApiCallerFromEnv>;
type AuditApiClient = ConfiguredApiCaller<typeof createAuditApiClientFromEnv>;
type WorkflowApiCaller = ConfiguredApiCaller<typeof createWorkflowApiCallerFromEnv>;
type WorkflowApiOverlay<T extends object> = Omit<T, keyof WorkflowApiCaller> & {
  planning: NestedMerge<T extends { planning?: infer Planning } ? NonNullable<Planning> : never, WorkflowApiCaller["planning"]>;
  tasks: NestedMerge<T extends { tasks?: infer Tasks } ? NonNullable<Tasks> : never, WorkflowApiCaller["tasks"]>;
  workflows: NestedMerge<T extends { workflows?: infer Workflows } ? NonNullable<Workflows> : never, WorkflowApiCaller["workflows"]>;
};

interface OverlayOptions {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

export function withNotificationApiCaller<T extends object>(
  caller: T,
  options: OverlayOptions = {},
): MergedCaller<T, NotificationApiCaller> {
  const publicApiCaller = createNotificationApiCallerFromEnv(options.env, options.fetch);
  if (!publicApiCaller) return caller as unknown as MergedCaller<T, NotificationApiCaller>;
  return { ...caller, notify: publicApiCaller.notify } as unknown as MergedCaller<T, NotificationApiCaller>;
}

export function withDocumentApiCaller<T extends object>(
  caller: T,
  options: OverlayOptions = {},
): MergedCaller<T, { docs: NestedMerge<T extends { docs?: infer Docs } ? NonNullable<Docs> : never, DocumentApiCaller["docs"]> }> {
  const publicApiCaller = createDocumentApiCallerFromEnv(options.env, options.fetch);
  if (!publicApiCaller) {
    return caller as unknown as MergedCaller<T, { docs: NestedMerge<T extends { docs?: infer Docs } ? NonNullable<Docs> : never, DocumentApiCaller["docs"]> }>;
  }
  const current = caller as { docs?: unknown };
  return {
    ...caller,
    docs: { ...(current.docs ? current.docs as Record<string, unknown> : {}), ...publicApiCaller.docs },
  } as unknown as MergedCaller<T, { docs: NestedMerge<T extends { docs?: infer Docs } ? NonNullable<Docs> : never, DocumentApiCaller["docs"]> }>;
}

export function withAgentRunApiCaller<T extends object>(
  caller: T,
  options: OverlayOptions = {},
): MergedCaller<T, AgentRunApiCaller> {
  const publicApiCaller = createAgentRunApiCallerFromEnv(options.env, options.fetch);
  if (!publicApiCaller) {
    return caller as unknown as MergedCaller<T, AgentRunApiCaller>;
  }
  const current = caller as { runs?: unknown; agent_runs?: unknown };
  return {
    ...caller,
    runs: { ...(current.runs ? current.runs as Record<string, unknown> : {}), ...publicApiCaller.runs },
    agent_runs: { ...(current.agent_runs ? current.agent_runs as Record<string, unknown> : {}), ...publicApiCaller.agent_runs },
  } as unknown as MergedCaller<T, AgentRunApiCaller>;
}

export function withAuditApiCaller<T extends object>(
  caller: T,
  options: OverlayOptions = {},
): MergedCaller<T, { audit: AuditApiClient }> {
  const publicApiClient = createAuditApiClientFromEnv(options.env, options.fetch);
  if (!publicApiClient) return caller as unknown as MergedCaller<T, { audit: AuditApiClient }>;
  return { ...caller, audit: publicApiClient } as unknown as MergedCaller<T, { audit: AuditApiClient }>;
}

export function withWebhookApiCaller<T extends object>(
  caller: T,
  options: OverlayOptions = {},
): MergedCaller<T, WebhookApiCaller> {
  const publicApiCaller = createWebhookApiCallerFromEnv(options.env, options.fetch);
  if (!publicApiCaller) return caller as unknown as MergedCaller<T, WebhookApiCaller>;
  return { ...caller, webhooks: publicApiCaller.webhooks } as unknown as MergedCaller<T, WebhookApiCaller>;
}

export function withWorkflowApiCaller<T extends object>(
  caller: T,
  options: OverlayOptions = {},
): WorkflowApiOverlay<T> {
  const publicApiCaller = createWorkflowApiCallerFromEnv(options.env, options.fetch);
  if (!publicApiCaller) return caller as unknown as WorkflowApiOverlay<T>;
  const current = caller as { planning?: unknown; tasks?: unknown; workflows?: unknown };
  return {
    ...caller,
    planning: { ...(current.planning ? current.planning as Record<string, unknown> : {}), ...publicApiCaller.planning },
    tasks: { ...(current.tasks ? current.tasks as Record<string, unknown> : {}), ...publicApiCaller.tasks },
    workflows: { ...(current.workflows ? current.workflows as Record<string, unknown> : {}), ...publicApiCaller.workflows },
  } as unknown as WorkflowApiOverlay<T>;
}
