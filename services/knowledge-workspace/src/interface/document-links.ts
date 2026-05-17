export type {
  Backlink,
  UpsertDocLinkInput,
} from "@knowledge-workspace/application/doc-links/queries.ts";

type GetBacklinks = typeof import("@knowledge-workspace/application/doc-links/queries.ts").getBacklinks;
type UpsertDocLink = typeof import("@knowledge-workspace/application/doc-links/queries.ts").upsertDocLink;

export async function upsertDocLink(
  ...args: Parameters<UpsertDocLink>
): Promise<Awaited<ReturnType<UpsertDocLink>>> {
  const queries = await import("@knowledge-workspace/application/doc-links/queries.ts");
  return queries.upsertDocLink(...args);
}

export async function getBacklinks(
  ...args: Parameters<GetBacklinks>
): Promise<Awaited<ReturnType<GetBacklinks>>> {
  const queries = await import("@knowledge-workspace/application/doc-links/queries.ts");
  return queries.getBacklinks(...args);
}
