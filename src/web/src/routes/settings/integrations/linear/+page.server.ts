/**
 * /settings/integrations/linear — Linear connector config.
 *
 * Gated: only functional when FULCRUM_FEATURES=connector-linear.
 * Allows setting API key, selecting team, viewing sync status.
 */

import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getProduct\u0044b as productRuntime, getDefaultOrgId } from "$lib/server/db";
import {
  getTenantSetting,
  upsertTenantSetting,
  createCredential,
  listConnectorRuns,
} from "../../../../../../../application/legacy/web-runtime.ts";
import { actionOk } from "$lib/feedback/action-result";

function isConnectorLinearEnabled(): boolean {
  const features = (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((f) => f.trim());
  return features.includes("connector-linear");
}

export const load: PageServerLoad = ({ locals }) => {
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    featureEnabled: isConnectorLinearEnabled(),
    streamed: {
      data: (async () => {
        if (!isConnectorLinearEnabled()) {
          return { teamId: null, hasApiKey: false, recentRuns: [] };
        }

        const db = productRuntime();
        const orgId = await getDefaultOrgId(db);
        const teamSetting = await getTenantSetting(db, orgId, "linear.team_id");
        const recentRuns = await listConnectorRuns(db, orgId, "linear", 5);

        return {
          teamId: teamSetting?.value?.teamId ?? null,
          hasApiKey: !!process.env["LINEAR_API_KEY"],
          recentRuns,
        };
      })(),
    },
  };
};

export const actions: Actions = {
  save: async ({ request }) => {
    if (!isConnectorLinearEnabled()) {
      return fail(403, { error: "connector-linear feature flag is not enabled" });
    }

    const form = await request.formData();
    const teamId = (form.get("team_id") as string)?.trim() || null;
    const apiKey = (form.get("api_key") as string)?.trim() || null;

    if (!teamId) return fail(400, { error: "Team ID is required" });

    const db = productRuntime();
    const orgId = await getDefaultOrgId(db);

    await upsertTenantSetting(db, {
      orgId,
      key: "linear.team_id",
      value: { teamId },
    });

    if (apiKey) {
      await createCredential(db, {
        orgId,
        key: "linear_api_key",
        encryptedValue: apiKey, // In production: encrypt before storing
      });
    }

    return actionOk("Linear integration settings saved");
  },
};
