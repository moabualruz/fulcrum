import type { Actions, PageServerLoad } from "./$types";
import { error, fail } from "@sveltejs/kit";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { newUlid } from "../../../../../../product-kernel/ids.ts";

interface RepoRow {
  id: string;
  name: string | null;
  slug: string;
  current_branch: string | null;
}

interface BranchRow {
  name: string;
  sha: string | null;
  is_default: boolean | null;
}

async function writeOpsEnabled(db: Awaited<ReturnType<typeof openProductDb>>, orgId: string): Promise<boolean> {
  const exists = await db.query<{ to_regclass: string | null }>(`SELECT to_regclass('feature_flags')`);
  if (!exists[0]?.to_regclass) return false;
  const rows = await db.query<{ enabled: boolean }>(
    `SELECT enabled FROM feature_flags
      WHERE flag = 'repo-write-ops' AND enabled = true AND (org_id = $1 OR org_id IS NULL)
      LIMIT 1`,
    [orgId],
  );
  return rows[0]?.enabled === true;
}

function gated() {
  return fail(403, {
    ok: false,
    code: "FEATURE_GATED",
    message: "Write operations disabled. Enable repo-write-ops to create, checkout, or delete branches.",
  });
}

export const load: PageServerLoad = ({ params, locals }) => ({
  activeProjectId: locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      const db = await openProductDb();
      try {
        const orgId = await getDefaultOrgId(db);
        const repos = await db.query<RepoRow>(
          `SELECT id, name, slug, current_branch
             FROM repos
            WHERE org_id = $1 AND id = $2 AND COALESCE(archived, false) = false`,
          [orgId, params.id],
        );
        const repo = repos[0];
        if (!repo) throw error(404, "repo not found");
        const branches = await db.query<BranchRow>(
          `SELECT name, sha, is_default
             FROM repo_branches
            WHERE org_id = $1 AND repo_id = $2
            ORDER BY name ASC`,
          [orgId, params.id],
        );
        return {
          repo: {
            id: repo.id,
            name: repo.name || repo.slug,
            slug: repo.slug,
            currentBranch: repo.current_branch,
          },
          writeOpsEnabled: await writeOpsEnabled(db, orgId),
          gate: {
            code: "FEATURE_GATED",
            message: "Write operations disabled. Enable repo-write-ops to create, checkout, or delete branches.",
          },
          branches: branches.map((branch) => ({
            name: branch.name,
            headSha: branch.sha,
            isCurrent: branch.name === repo.current_branch,
            isDefault: branch.is_default === true,
          })),
        };
      } finally {
        await db.close();
      }
    })(),
  },
});

async function requireWriteOps(db: Awaited<ReturnType<typeof openProductDb>>, orgId: string) {
  if (!(await writeOpsEnabled(db, orgId))) return gated();
  return null;
}

export const actions: Actions = {
  create: async ({ params, request }) => {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      const gate = await requireWriteOps(db, orgId);
      if (gate) return gate;
      if (!name) return fail(400, { ok: false, message: "branch name required" });
      await db.query(
        `INSERT INTO repo_branches (id, org_id, repo_id, name, sha, is_default)
         VALUES ($1, $2, $3, $4, null, false)`,
        [newUlid(), orgId, params.id, name],
      );
      return { ok: true };
    } finally {
      await db.close();
    }
  },
  checkout: async ({ params, request }) => {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      const gate = await requireWriteOps(db, orgId);
      if (gate) return gate;
      await db.query(
        `UPDATE repos SET current_branch = $1, last_touched_at = now() WHERE org_id = $2 AND id = $3`,
        [name, orgId, params.id],
      );
      return { ok: true };
    } finally {
      await db.close();
    }
  },
  delete: async ({ params, request }) => {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      const gate = await requireWriteOps(db, orgId);
      if (gate) return gate;
      await db.query(
        `DELETE FROM repo_branches WHERE org_id = $1 AND repo_id = $2 AND name = $3 AND COALESCE(is_default, false) = false`,
        [orgId, params.id, name],
      );
      return { ok: true };
    } finally {
      await db.close();
    }
  },
};
