import { error } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { actionOk } from "$lib/feedback/action-result";
import { getRepoDashboard, getRepoDetail } from "@integration-hub/application/repos/dashboard.ts";
import { queueRepositorySync } from "../repository-sync-api";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

function activeOrgId(locals: App.Locals): string {
  return locals?.orgId ?? DEFAULT_ORG_ID;
}

function isoDetail<T extends { updatedAt?: Date; committedAt?: Date; createdAt?: Date }>(rows: T[]): Array<Omit<T, "updatedAt" | "committedAt" | "createdAt"> & {
  updatedAt?: string;
  committedAt?: string;
  createdAt?: string;
}> {
  return rows.map((row) => ({
    ...row,
    ...(row.updatedAt ? { updatedAt: row.updatedAt.toISOString() } : {}),
    ...(row.committedAt ? { committedAt: row.committedAt.toISOString() } : {}),
    ...(row.createdAt ? { createdAt: row.createdAt.toISOString() } : {}),
  }));
}

export const load: PageServerLoad = ({ params, locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;
  const orgId = activeOrgId(locals);

  return {
    activeProjectId,
    streamed: {
      data: (async () => {
        const [repos, detail] = await Promise.all([
          getRepoDashboard(orgId),
          getRepoDetail(orgId, params.id),
        ]);
        const repo = repos.find((row) => row.id === params.id);
        if (!repo) throw error(404, "Repo not found");

        return {
          repo,
          branches: isoDetail(detail.branches),
          commits: isoDetail(detail.commits),
          files: isoDetail(detail.files),
          syncLog: isoDetail(detail.syncLog),
        };
      })(),
    },
  };
};

export const actions: Actions = {
  sync: async (event) => {
    await queueRepositorySync(event, event.params.id);
    return actionOk("Repo sync queued");
  },
};
