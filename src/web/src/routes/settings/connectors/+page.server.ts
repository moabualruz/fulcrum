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
import {
  CONNECTOR_NAMES,
  isConnectorEnabled,
  listConnectors,
  listSyncLog,
  saveConnectorConfig,
  syncConnector,
  type ConnectorName,
} from "../../../../../application/connectors/web-actions.ts";
import { AppInvariantError, AppValidationError } from "../../../../../application/errors.ts";

export { isConnectorEnabled as _isConnectorEnabled, listSyncLog as _listSyncLog };

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.session) throw redirect(302, "/auth/login");

  return {
    connectors: listConnectors(),
    syncLog: listSyncLog(),
  };
};

export const actions: Actions = {
  save: async ({ locals, request }) => {
    if (!locals.session) throw redirect(302, "/auth/login");

    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim() as ConnectorName;

    if (!CONNECTOR_NAMES.includes(name)) return fail(400, { saveError: "Unknown connector" });
    if (!isConnectorEnabled(name)) throw error(403, `connector-${name} feature not enabled`);

    const host = stringField(form, "host").trim();
    const email = stringField(form, "email").trim();
    const token = stringField(form, "token").trim();

    if (!host) return fail(400, { saveError: "Host is required", name });
    if (!token) return fail(400, { saveError: "Token is required", name });

    try {
      await saveConnectorConfig({ name, host, email, token });
    } catch (errorValue) {
      return mapConnectorError(errorValue, "saveError", name);
    }
  },

  sync: async ({ locals, request }) => {
    if (!locals.session) throw redirect(302, "/auth/login");

    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim() as ConnectorName;

    if (!CONNECTOR_NAMES.includes(name)) return fail(400, { syncError: "Unknown connector" });
    if (!isConnectorEnabled(name)) throw error(403, `connector-${name} feature not enabled`);

    try {
      await syncConnector(name);
    } catch (errorValue) {
      return mapConnectorError(errorValue, "syncError", name);
    }
  },
};

function mapConnectorError(errorValue: unknown, key: "saveError" | "syncError", name: ConnectorName) {
  const message = errorValue instanceof Error ? errorValue.message : String(errorValue);
  if (errorValue instanceof AppValidationError) return fail(400, { [key]: message, name });
  if (errorValue instanceof AppInvariantError) return fail(501, { [key]: message, name });
  throw errorValue;
}

function stringField(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}
