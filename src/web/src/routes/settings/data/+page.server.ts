import type { PageServerLoad, Actions } from "./$types";
import { openDatabase } from "$lib/server/db";
import { fail } from "@sveltejs/kit";

const ENTITY_KINDS = ["projects", "tasks", "credentials", "feature_flags", "backups"] as const;
type EntityKind = (typeof ENTITY_KINDS)[number];

export const load: PageServerLoad = () => {
  return { entityKinds: ENTITY_KINDS };
};

export const actions: Actions = {
  export: async ({ request }) => {
    const form = await request.formData();
    const kinds = form.getAll("kinds") as EntityKind[];
    const selected = kinds.length > 0 ? kinds : [...ENTITY_KINDS];
    const db = await openDatabase();
    try {
      const result: Record<string, unknown[]> = {};
      for (const kind of selected) {
        try {
          const rows = await db.query(`SELECT * FROM ${kind} LIMIT 5000`);
          result[kind] = rows;
        } catch {
          result[kind] = [];
        }
      }
      return { exported: true, data: JSON.stringify(result, null, 2), filename: `fulcrum-export-${Date.now()}.json` };
    } finally {
      await db.close();
    }
  },

  preflight: async ({ request }) => {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file || file.size === 0) return fail(400, { error: "file required" });
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return fail(400, { error: "invalid JSON" });
    }
    const obj = parsed as Record<string, unknown>;
    const summary: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v)) summary[k] = v.length;
    }
    return { preflightSummary: summary };
  },

  import: async ({ request }) => {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file || file.size === 0) return fail(400, { error: "file required" });
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return fail(400, { error: "invalid JSON" });
    }
    const obj = parsed as Record<string, unknown[]>;
    const db = await openDatabase();
    let totalRows = 0;
    try {
      for (const [, rows] of Object.entries(obj)) {
        if (Array.isArray(rows)) totalRows += rows.length;
      }
      // Real import would upsert rows here
      return { imported: true, totalRows };
    } finally {
      await db.close();
    }
  },
};
