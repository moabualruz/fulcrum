/**
 * /settings/connectors — gated connector management (Confluence, Notion, GitHub Issues).
 *
 * Gated by FULCRUM_FEATURES (C1, default OFF).
 * Each connector is independently gated:
 *   - connector-confluence
 *   - connector-notion
 *   - connector-github-issues
 *
 * Flag OFF → card disabled/grayed. Flag ON → config form + "Test connection" + "Sync now" + sync log.
 */

import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

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

/** In-memory stub stores (replaced by DB in production). */
const _configs: Map<ConnectorName, ConnectorConfig> = new Map();
const _syncLog: SyncLogEntry[] = [];

function getFeatures(): string[] {
  return (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((f) => f.trim()).filter(Boolean);
}

function isConnectorEnabled(name: ConnectorName): boolean {
  return getFeatures().includes(`connector-${name}`);
}

function hasAnyConnector(): boolean {
  const names: ConnectorName[] = ["confluence", "notion", "github-issues"];
  return names.some((n) => isConnectorEnabled(n));
}

function getConnectorConfig(name: ConnectorName): ConnectorConfig | undefined {
  return _configs.get(name);
}

function setConnectorConfig(cfg: ConnectorConfig): void {
  _configs.set(cfg.name, cfg);
}

function getSyncLog(): SyncLogEntry[] {
  return _syncLog;
}

function addSyncLogEntry(entry: SyncLogEntry): void {
  _syncLog.push(entry);
}

const CONNECTOR_NAMES: ConnectorName[] = ["confluence", "notion", "github-issues"];

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.session) throw redirect(302, "/auth/login");

  const connectors = CONNECTOR_NAMES.map((name) => ({
    name,
    enabled: isConnectorEnabled(name),
    config: getConnectorConfig(name) ?? null,
  }));

  return {
    connectors,
    syncLog: getSyncLog(),
  };
};

export const actions: Actions = {
  save: async ({ locals, request }) => {
    if (!locals.session) throw redirect(302, "/auth/login");

    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim() as ConnectorName;

    if (!CONNECTOR_NAMES.includes(name)) return fail(400, { saveError: "Unknown connector" });
    if (!isConnectorEnabled(name)) throw error(403, `connector-${name} feature not enabled`);

    const host = String(form.get("host") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const token = String(form.get("token") ?? "").trim();

    if (!host) return fail(400, { saveError: "Host is required", name });
    if (!token) return fail(400, { saveError: "Token is required", name });

    setConnectorConfig({ name, host, email, token });
    return { saveOk: true, name };
  },

  sync: async ({ locals, request }) => {
    if (!locals.session) throw redirect(302, "/auth/login");

    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim() as ConnectorName;

    if (!CONNECTOR_NAMES.includes(name)) return fail(400, { syncError: "Unknown connector" });
    if (!isConnectorEnabled(name)) throw error(403, `connector-${name} feature not enabled`);

    const entry: SyncLogEntry = {
      id: crypto.randomUUID(),
      connectorName: name,
      startedAt: new Date().toISOString(),
      status: "success",
      message: `Sync triggered for ${name}`,
    };
    addSyncLogEntry(entry);
    return { syncOk: true, name, entryId: entry.id };
  },
};
