import type { PageServerLoad } from "./$types";
import { openProductDb } from "$lib/server/db";

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  updated_at: string;
}

export const load: PageServerLoad = ({ locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;
  return {
    activeProjectId,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const projects = await db.query<ProjectRow>(
            `SELECT id, slug, name, description, updated_at
               FROM projects ORDER BY created_at ASC, id ASC`,
          );
          return { projects };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
