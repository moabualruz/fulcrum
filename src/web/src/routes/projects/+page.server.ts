import { listProjects } from "$lib/product-queries";

export async function load() {
  const projects = await listProjects();
  return { projects };
}
