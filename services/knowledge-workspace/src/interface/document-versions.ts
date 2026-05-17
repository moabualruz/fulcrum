export type {
  CreateVersionInput,
  DocVersion,
} from "@knowledge-workspace/application/docs/version-queries.ts";

type CreateDocumentVersion = typeof import("@knowledge-workspace/application/docs/version-queries.ts").createDocumentVersion;
type GetDocumentVersion = typeof import("@knowledge-workspace/application/docs/version-queries.ts").getDocumentVersion;
type GetNextVersionNumber = typeof import("@knowledge-workspace/application/docs/version-queries.ts").getNextVersionNumber;
type ListDocumentVersions = typeof import("@knowledge-workspace/application/docs/version-queries.ts").listDocumentVersions;
type RestoreDocumentVersion = typeof import("@knowledge-workspace/application/docs/version-queries.ts").restoreDocumentVersion;

export async function createDocumentVersion(
  ...args: Parameters<CreateDocumentVersion>
): Promise<Awaited<ReturnType<CreateDocumentVersion>>> {
  const queries = await import("@knowledge-workspace/application/docs/version-queries.ts");
  return queries.createDocumentVersion(...args);
}

export async function listDocumentVersions(
  ...args: Parameters<ListDocumentVersions>
): Promise<Awaited<ReturnType<ListDocumentVersions>>> {
  const queries = await import("@knowledge-workspace/application/docs/version-queries.ts");
  return queries.listDocumentVersions(...args);
}

export async function getDocumentVersion(
  ...args: Parameters<GetDocumentVersion>
): Promise<Awaited<ReturnType<GetDocumentVersion>>> {
  const queries = await import("@knowledge-workspace/application/docs/version-queries.ts");
  return queries.getDocumentVersion(...args);
}

export async function restoreDocumentVersion(
  ...args: Parameters<RestoreDocumentVersion>
): Promise<Awaited<ReturnType<RestoreDocumentVersion>>> {
  const queries = await import("@knowledge-workspace/application/docs/version-queries.ts");
  return queries.restoreDocumentVersion(...args);
}

export async function getNextVersionNumber(
  ...args: Parameters<GetNextVersionNumber>
): Promise<Awaited<ReturnType<GetNextVersionNumber>>> {
  const queries = await import("@knowledge-workspace/application/docs/version-queries.ts");
  return queries.getNextVersionNumber(...args);
}
