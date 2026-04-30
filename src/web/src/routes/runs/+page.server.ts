import { listRuns } from "$lib/product-queries";

export async function load() {
  const runs = await listRuns();
  return { runs };
}
