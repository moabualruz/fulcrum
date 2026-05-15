import type { DiContainer } from "@platform-core/application/runtime/di-container.ts";
import { createAgentRunApiCallerFromEnv } from "@execution-orchestration/interface/http/agent-run-api-client.ts";
import { createNotificationApiCallerFromEnv } from "@notification-center/interface/http/notification-api-client.ts";
import { createWebhookApiCallerFromEnv } from "@integration-hub/interface/http/webhook-api-client.ts";
import { createAuditApiClientFromEnv } from "@workflow-coordination/interface/http/audit-api-client.ts";
import { createWorkflowApiCallerFromEnv } from "@workflow-coordination/interface/http/workflow-api-client.ts";
import {
  createApplicationLocalCaller,
  requireCliTuiSessionContext,
} from "@fulcrum/server/runtime/trpc/local-caller.ts";

type ConfiguredApiCaller<T extends (...args: never[]) => unknown> = Exclude<ReturnType<T>, null>;
type MergedCaller<Base extends object, Overlay extends object> = Omit<Base, keyof Overlay> & Overlay;
type NestedMerge<Base, Overlay extends object> = Base extends object ? Omit<Base, keyof Overlay> & Overlay : Overlay;
type NotificationApiCaller = ConfiguredApiCaller<typeof createNotificationApiCallerFromEnv>;
type AgentRunApiCaller = ConfiguredApiCaller<typeof createAgentRunApiCallerFromEnv>;
type WebhookApiCaller = ConfiguredApiCaller<typeof createWebhookApiCallerFromEnv>;
type AuditApiClient = ConfiguredApiCaller<typeof createAuditApiClientFromEnv>;
type WorkflowApiCaller = ConfiguredApiCaller<typeof createWorkflowApiCallerFromEnv>;
type WorkflowApiOverlay<T extends object> = Omit<T, keyof WorkflowApiCaller> & {
  planning: NestedMerge<T extends { planning?: infer Planning } ? NonNullable<Planning> : never, WorkflowApiCaller["planning"]>;
  tasks: NestedMerge<T extends { tasks?: infer Tasks } ? NonNullable<Tasks> : never, WorkflowApiCaller["tasks"]>;
  workflows: NestedMerge<T extends { workflows?: infer Workflows } ? NonNullable<Workflows> : never, WorkflowApiCaller["workflows"]>;
};

export function createTuiLocalCaller(options: {
  container?: DiContainer | null;
  userAgent?: string;
} = {}) {
  return createApplicationLocalCaller(options);
}

export function requireTuiSessionContext(options: {
  container?: DiContainer | null;
  userAgent?: string;
} = {}) {
  return requireCliTuiSessionContext(options);
}

export function withNotificationApiCaller<T extends object>(
  caller: T,
  options: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
  } = {},
): MergedCaller<T, NotificationApiCaller> {
  const publicApiCaller = createNotificationApiCallerFromEnv(options.env, options.fetch);
  if (!publicApiCaller) return caller as unknown as MergedCaller<T, NotificationApiCaller>;
  return { ...caller, notify: publicApiCaller.notify } as unknown as MergedCaller<T, NotificationApiCaller>;
}

export function withAgentRunApiCaller<T extends object>(
  caller: T,
  options: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
  } = {},
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
  options: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
  } = {},
): MergedCaller<T, { audit: AuditApiClient }> {
  const publicApiClient = createAuditApiClientFromEnv(options.env, options.fetch);
  if (!publicApiClient) return caller as unknown as MergedCaller<T, { audit: AuditApiClient }>;
  return { ...caller, audit: publicApiClient } as unknown as MergedCaller<T, { audit: AuditApiClient }>;
}

export function withWebhookApiCaller<T extends object>(
  caller: T,
  options: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
  } = {},
): MergedCaller<T, WebhookApiCaller> {
  const publicApiCaller = createWebhookApiCallerFromEnv(options.env, options.fetch);
  if (!publicApiCaller) return caller as unknown as MergedCaller<T, WebhookApiCaller>;
  return { ...caller, webhooks: publicApiCaller.webhooks } as unknown as MergedCaller<T, WebhookApiCaller>;
}

export function withWorkflowApiCaller<T extends object>(
  caller: T,
  options: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
  } = {},
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
