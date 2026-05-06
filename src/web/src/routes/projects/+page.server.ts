import type { PageServerLoad } from "./$types";
import { listProjects } from "$lib/product-queries";

export const load: PageServerLoad = ({ locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;
  return {
    activeProjectId,
    streamed: {
      data: (async () => {
        const projects = await listProjects();
        return { projects };
      })(),
    },
  };
};
