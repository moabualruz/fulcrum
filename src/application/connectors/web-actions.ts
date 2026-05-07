import { AppInvariantError, AppValidationError } from "../errors.ts";

export type ConnectorName = "confluence" | "notion" | "github-issues";

export interface ConnectorConfig {
  name: ConnectorName;
  host: string;
  email: string;
  token: string;
}

export interface SyncLogEntry {
  id: string;
  connectorName: ConnectorName;
  startedAt: string;
  status: "success" | "failure" | "running";
  message: string;
}

export interface ConnectorDescriptor {
  name: ConnectorName;
  enabled: boolean;
  config: ConnectorConfig | null;
}

export const CONNECTOR_NAMES: ConnectorName[] = ["confluence", "notion", "github-issues"];

export function featureList(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env["FULCRUM_FEATURES"] ?? "").split(",").map((feature) => feature.trim()).filter(Boolean);
}

export function isConnectorEnabled(name: ConnectorName, env: NodeJS.ProcessEnv = process.env): boolean {
  return featureList(env).includes(`connector-${name}`);
}

export function listConnectors(env: NodeJS.ProcessEnv = process.env): ConnectorDescriptor[] {
  return CONNECTOR_NAMES.map((name) => ({
    name,
    enabled: isConnectorEnabled(name, env),
    config: null,
  }));
}

export function listSyncLog(): SyncLogEntry[] {
  return [];
}

export async function saveConnectorConfig(input: ConnectorConfig, env: NodeJS.ProcessEnv = process.env): Promise<never> {
  assertConnectorEnabled(input.name, env);
  if (!input.host) throw new AppValidationError("Host is required.");
  if (!input.token) throw new AppValidationError("Token is required.");
  throw new AppInvariantError("Global connector persistence is not configured; use project connector settings.");
}

export async function syncConnector(name: ConnectorName, env: NodeJS.ProcessEnv = process.env): Promise<never> {
  assertConnectorEnabled(name, env);
  throw new AppInvariantError("Global connector sync is not configured; use project connector settings.");
}

function assertConnectorEnabled(name: ConnectorName, env: NodeJS.ProcessEnv): void {
  if (!CONNECTOR_NAMES.includes(name)) throw new AppValidationError("Unknown connector.");
  if (!isConnectorEnabled(name, env)) throw new AppValidationError(`connector-${name} feature not enabled.`);
}
