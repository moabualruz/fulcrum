import { listDocuments } from "$lib/product-queries";

export async function load() {
  const documents = await listDocuments();
  return { documents };
}
