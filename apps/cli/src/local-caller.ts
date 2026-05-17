/**
 * CLI caller factory — session resolution utilities for CLI commands.
 *
 * CLI commands now use per-service HTTP API clients directly.
 * This module provides session resolution through the local application context
 * and the withWorkflowApiCaller overlay for backward compatibility.
 */

import type { DiContainer } from "@platform-core/interface/runtime-container.ts";
import { createWorkflowApiCallerFromEnv } from "@workflow-coordination/interface/http/workflow-api-client.ts";
import {
  buildCliTuiCallerContext,
  requireCliTuiSessionContext,
  type LocalCallerOptions,
} from "@fulcrum/server/session/local-session.ts";

export { buildCliTuiCallerContext, requireCliTuiSessionContext } from "@fulcrum/server/session/local-session.ts";
export type { CliTuiCallerContext, CliTuiSession } from "@fulcrum/server/session/local-session.ts";

type ConfiguredWorkflowApiCaller = Exclude<ReturnType<typeof createWorkflowApiCallerFromEnv>, null>;
type NestedMerge<Base, Overlay extends object> = Base extends object ? Omit<Base, keyof Overlay> & Overlay : Overlay;
type WorkflowApiOverlay<T extends object> = Omit<T, keyof ConfiguredWorkflowApiCaller> & {
  planning: NestedMerge<
    T extends { planning?: infer Planning } ? NonNullable<Planning> : never,
    ConfiguredWorkflowApiCaller["planning"]
  >;
  tasks: NestedMerge<T extends { tasks?: infer Tasks } ? NonNullable<Tasks> : never, ConfiguredWorkflowApiCaller["tasks"]>;
  reports: NestedMerge<
    T extends { reports?: infer Reports } ? NonNullable<Reports> : never,
    ConfiguredWorkflowApiCaller["reports"]
  >;
  workflows: NestedMerge<
    T extends { workflows?: infer Workflows } ? NonNullable<Workflows> : never,
    ConfiguredWorkflowApiCaller["workflows"]
  >;
};

export async function createLocalCaller(input?: DiContainer | LocalCallerOptions | null) {
  const { createApplicationLocalCaller } = await import("@fulcrum/server/trpc/local-caller.ts");
  const options: LocalCallerOptions = input && typeof input === "object" && "container" in input
    ? (input as LocalCallerOptions)
    : { container: (input as DiContainer | undefined) ?? undefined };
  return createApplicationLocalCaller(options);
}

export function buildLocalCallerContext(container: DiContainer | null) {
  return buildCliTuiCallerContext(container);
}

export function requireLocalSessionContext(options: {
  container?: DiContainer | null;
  missingSessionMessage?: string;
  userAgent?: string;
} = {}) {
  return requireCliTuiSessionContext(options);
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
  const current = caller as { planning?: unknown; tasks?: unknown; reports?: unknown; workflows?: unknown };
  return {
    ...caller,
    planning: { ...(current.planning ? current.planning as Record<string, unknown> : {}), ...publicApiCaller.planning },
    tasks: { ...(current.tasks ? current.tasks as Record<string, unknown> : {}), ...publicApiCaller.tasks },
    reports: { ...(current.reports ? current.reports as Record<string, unknown> : {}), ...publicApiCaller.reports },
    workflows: { ...(current.workflows ? current.workflows as Record<string, unknown> : {}), ...publicApiCaller.workflows },
  } as unknown as WorkflowApiOverlay<T>;
}
