import type { PageServerLoad } from "./$types";
import { openProductDb } from "$lib/server/db";

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  updated_at: string | Date;
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export const load: PageServerLoad = ({ locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;
  return {
    activeProjectId,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const rows = await db.query<ProjectRow>(
            `SELECT id, slug, name, description, updated_at
               FROM projects ORDER BY created_at ASC, id ASC`,
          );
          const projects = rows.map((r) => ({ ...r, updated_at: isoStamp(r.updated_at) }));
          return { projects };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
