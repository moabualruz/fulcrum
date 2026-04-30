import type { PageServerLoad } from "./$types";
import { listProjects } from "$lib/product-queries";

export const load: PageServerLoad = async () => {
  const projects = await listProjects();
  return { projects };
};
