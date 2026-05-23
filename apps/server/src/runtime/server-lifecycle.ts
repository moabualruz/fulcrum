import type { DataSource, EntityManager } from "typeorm";

import { startYjsServer, type YjsRuntimeServer } from "./yjs-server.ts";

export const SERVER_STARTUP_ORDER = [
  "config",
  "database",
  "migrations",
  "nest",
  "streams-workers",
] as const;

export type ServerStartupStep = typeof SERVER_STARTUP_ORDER[number];

export type RuntimeComponentName = "yjs-collaboration";

export interface RuntimeReadinessComponent {
  name: RuntimeComponentName;
  status: "disabled" | "ready" | "failed";
  detail: string;
}

export interface RuntimeReadinessState {
  status: "starting" | "ready" | "failed";
  completed: ServerStartupStep[];
  components: RuntimeReadinessComponent[];
  failure?: {
    step: ServerStartupStep;
    message: string;
  };
}

export interface RuntimeCloseable {
  name: RuntimeComponentName;
  close: () => Promise<void> | void;
}

export interface RuntimeLifecycleLogEvent {
  phase: "startup" | "readiness";
  step?: ServerStartupStep;
  component?: RuntimeComponentName;
  status?: RuntimeReadinessState["status"] | RuntimeReadinessComponent["status"];
  detail?: string;
}

export interface RuntimeLifecycleLogger {
  (event: RuntimeLifecycleLogEvent): void;
}

export function createRuntimeReadiness(): RuntimeReadinessState {
  return {
    status: "starting",
    completed: [],
    components: [],
  };
}

export function recordStartupStep(
  readiness: RuntimeReadinessState,
  step: ServerStartupStep,
  log?: RuntimeLifecycleLogger,
): void {
  if (!readiness.completed.includes(step)) readiness.completed.push(step);
  log?.({ phase: "startup", step, status: readiness.status });
}

export function recordStartupFailure(
  readiness: RuntimeReadinessState,
  step: ServerStartupStep,
  error: unknown,
  log?: RuntimeLifecycleLogger,
): RuntimeReadinessState {
  const message = error instanceof Error ? error.message : String(error);
  readiness.status = "failed";
  readiness.failure = { step, message };
  log?.({ phase: "readiness", step, status: "failed", detail: message });
  return readiness;
}

export function markRuntimeReady(
  readiness: RuntimeReadinessState,
  log?: RuntimeLifecycleLogger,
): RuntimeReadinessState {
  readiness.status = "ready";
  log?.({ phase: "readiness", status: "ready" });
  return readiness;
}

export function featureEnabled(
  env: Record<string, string | undefined>,
  feature: string,
): boolean {
  return (env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(feature);
}

export function resolveExplicitPort(
  env: Record<string, string | undefined>,
  key: string,
): number | null {
  const raw = env[key];
  if (!raw) return null;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid ${key}: ${raw}`);
  }
  return port;
}

export interface StartOptionalRuntimeComponentsOptions {
  dataSource: DataSource | null;
  env?: Record<string, string | undefined>;
  log?: RuntimeLifecycleLogger;
}

export async function startOptionalRuntimeComponents(
  options: StartOptionalRuntimeComponentsOptions,
): Promise<{ components: RuntimeReadinessComponent[]; closeables: RuntimeCloseable[] }> {
  const env = options.env ?? process.env;
  const components: RuntimeReadinessComponent[] = [];
  const closeables: RuntimeCloseable[] = [];

  const recordComponent = (component: RuntimeReadinessComponent): void => {
    components.push(component);
    options.log?.({
      phase: "readiness",
      component: component.name,
      status: component.status,
      detail: component.detail,
    });
  };

  if (!featureEnabled(env, "real-time-collab-server")) {
    recordComponent({
      name: "yjs-collaboration",
      status: "disabled",
      detail: "feature flag real-time-collab-server disabled",
    });
    return { components, closeables };
  }

  const yjsPort = resolveExplicitPort(env, "FULCRUM_YJS_PORT");
  if (yjsPort === null) {
    recordComponent({
      name: "yjs-collaboration",
      status: "disabled",
      detail: "set FULCRUM_YJS_PORT to enable Yjs collaboration server",
    });
    return { components, closeables };
  }

  if (!options.dataSource?.isInitialized) {
    recordComponent({
      name: "yjs-collaboration",
      status: "failed",
      detail: "DataSource is not initialized",
    });
    return { components, closeables };
  }

  try {
    const server = startYjsServer(options.dataSource.manager as EntityManager, yjsPort);
    await waitForYjsServerReady(server);
    recordComponent({
      name: "yjs-collaboration",
      status: "ready",
      detail: `listening on ${yjsPort}`,
    });
    closeables.push({
      name: "yjs-collaboration",
      close: () => server.closeRuntime(),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    recordComponent({
      name: "yjs-collaboration",
      status: "failed",
      detail,
    });
  }

  return { components, closeables };
}

async function waitForYjsServerReady(server: YjsRuntimeServer): Promise<void> {
  if ((server as YjsRuntimeServer & { listening?: boolean }).listening) return;
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}
