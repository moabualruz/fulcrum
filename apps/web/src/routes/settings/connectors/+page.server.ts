/**
 * /settings/connectors: gated connector management (Confluence, Notion, GitHub Issues).
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
import { createConnectorApiForEvent } from "$lib/server/connector-api";

const CONNECTOR_NAMES = ["confluence", "notion", "github-issues"] as const;
type ConnectorName = (typeof CONNECTOR_NAMES)[number];

interface ConnectorDescriptor {
  name: string;
  enabled: boolean;
  config?: {
    host?: string;
    email?: string;
    token?: string;
  };
}

interface ConnectorRunRow {
  id?: string;
  connectorId?: string;
  connector_id?: string;
  status?: string;
  summary?: { message?: string } | null;
  startedAt?: string | null;
  started_at?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
}

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session) throw redirect(302, "/auth/login");
  const api = createConnectorApiForEvent(event);
  const [connectorsResult, syncRunsResult] = await Promise.allSettled([
    api.connectors.list() as Promise<ConnectorDescriptor[]>,
    api.connectors.runs.list() as Promise<ConnectorRunRow[]>,
  ]);
  const connectors = connectorsResult.status === "fulfilled" ? connectorsResult.value : defaultConnectors();
  const syncRuns = syncRunsResult.status === "fulfilled" ? syncRunsResult.value : [];

  return {
    connectors,
    syncLog: syncRuns.map(toSyncLogEntry),
    loadError: connectorsResult.status === "rejected" || syncRunsResult.status === "rejected"
      ? "Connector API unavailable. Verify /settings/api base URL, then retry sync from /settings/connectors."
      : null,
  };
};

export const actions: Actions = {
  save: async (event) => {
    if (!event.locals.session) throw redirect(302, "/auth/login");

    const form = await event.request.formData();
    const name = String(form.get("name") ?? "").trim();

    if (!isConnectorName(name)) return fail(400, { saveError: "Unknown connector" });

    const host = stringField(form, "host").trim();
    const email = stringField(form, "email").trim();
    const token = stringField(form, "token").trim();

    const api = createConnectorApiForEvent(event);
    const connector = await api.connectors.get({ id: name }) as ConnectorDescriptor;
    if (!connector.enabled) throw error(403, `connector-${name} feature not enabled`);
    if (!host) return fail(400, { saveError: "Host is required", name });
    if (!token) return fail(400, { saveError: "Token is required", name });

    await api.connectors.enable({ id: name, config: { host, email, token } });
    return { saveOk: true, name };
  },

  sync: async (event) => {
    if (!event.locals.session) throw redirect(302, "/auth/login");

    const form = await event.request.formData();
    const name = String(form.get("name") ?? "").trim();

    if (!isConnectorName(name)) return fail(400, { syncError: "Unknown connector" });

    const api = createConnectorApiForEvent(event);
    const connector = await api.connectors.get({ id: name }) as ConnectorDescriptor;
    if (!connector.enabled) throw error(403, `connector-${name} feature not enabled`);
    await api.connectors.sync({ id: name, trigger: "manual" });
    return { syncOk: true, name };
  },
};

function isConnectorName(value: string): value is ConnectorName {
  return CONNECTOR_NAMES.includes(value as ConnectorName);
}

function stringField(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function defaultConnectors(): ConnectorDescriptor[] {
  return CONNECTOR_NAMES.map((name) => ({ name, enabled: false }));
}

function toSyncLogEntry(row: ConnectorRunRow) {
  return {
    id: row.id ?? "",
    connectorName: row.connectorId ?? row.connector_id ?? "",
    status: row.status ?? "queued",
    message: row.summary?.message ?? "",
    startedAt: row.startedAt ?? row.started_at ?? row.createdAt ?? row.created_at ?? "",
  };
}
