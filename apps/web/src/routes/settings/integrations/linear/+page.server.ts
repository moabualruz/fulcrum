/**
 * /settings/integrations/linear: Linear connector config.
 *
 * Gated: only functional when FULCRUM_FEATURES=connector-linear.
 * Allows setting API key, selecting team, viewing sync status.
 */

import { fail } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import { actionOk } from "$lib/feedback/action-result";
import { createConnectorApiForEvent } from "$lib/server/connector-api";

type ConnectorRun = {
  status?: string;
  startedAt?: string | Date | null;
  createdAt?: string | Date | null;
  summary?: Record<string, unknown> | null;
};

function isConnectorLinearEnabled(): boolean {
  const features = (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((f) => f.trim());
  return features.includes("connector-linear");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asConnectorConfig(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asConnectorRuns(value: unknown): ConnectorRun[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function syncRunRow(run: ConnectorRun) {
  const summary = asConnectorConfig(run.summary);
  return {
    status: run.status ?? "unknown",
    started_at: run.startedAt ?? run.createdAt ?? null,
    records_synced: Number(summary["recordsSynced"] ?? summary["records_synced"] ?? 0),
    error: typeof summary["error"] === "string" ? summary["error"] : null,
  };
}

async function loadLinearSettings(event: RequestEvent) {
  if (!isConnectorLinearEnabled()) {
    return { teamId: null, hasApiKey: false, recentRuns: [] };
  }

  const api = createConnectorApiForEvent(event);
  const [connector, runs] = await Promise.all([
    api.connectors.get({ id: "linear" }),
    api.connectors.runs.list({ connectorId: "linear" }),
  ]);
  const config = asConnectorConfig((connector as { config?: unknown }).config);

  return {
    teamId: typeof config["teamId"] === "string" ? config["teamId"] : null,
    hasApiKey: Boolean(config["apiKey"]) || Boolean(process.env["LINEAR_API_KEY"]),
    recentRuns: asConnectorRuns(runs).slice(0, 5).map(syncRunRow),
  };
}

export const load: PageServerLoad = (event) => {
  return {
    activeProjectId: event.locals?.activeProjectId ?? null,
    featureEnabled: isConnectorLinearEnabled(),
    streamed: {
      data: loadLinearSettings(event),
    },
  };
};

export const actions: Actions = {
  save: async (event) => {
    if (!isConnectorLinearEnabled()) {
      return fail(403, { error: "connector-linear feature flag is not enabled" });
    }

    const form = await event.request.formData();
    const teamId = (form.get("team_id") as string)?.trim() || null;
    const apiKey = (form.get("api_key") as string)?.trim() || null;

    if (!teamId) return fail(400, { error: "Team ID is required" });

    await createConnectorApiForEvent(event).connectors.enable({
      id: "linear",
      config: { teamId, ...(apiKey ? { apiKey } : {}) },
    });

    return actionOk("Linear integration settings saved");
  },
};
