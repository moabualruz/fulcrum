export type {
  DocDto,
  ListDocsInput,
} from "@knowledge-workspace/application/docs/types.ts";
export type {
  DocsEditScope,
  SaveWebEditDocInput,
  WebEditDoc,
} from "@knowledge-workspace/application/docs/web-edit.ts";
export type {
  DocTemplateRow,
  DocTemplateService,
} from "@knowledge-workspace/application/docs/doc-template-service.ts";
export {
  DOC_TEMPLATE_SERVICE_TOKEN,
} from "@knowledge-workspace/application/docs/doc-template-service.ts";
export {
  TEMPLATE_BODY_MAP,
} from "@knowledge-workspace/application/docs/template-seeds.ts";

type ListDocs = typeof import("@knowledge-workspace/application/docs/queries.ts").listDocs;
type LoadWebEditDoc = typeof import("@knowledge-workspace/application/docs/web-edit.ts").loadWebEditDoc;
type SaveWebEditDoc = typeof import("@knowledge-workspace/application/docs/web-edit.ts").saveWebEditDoc;

export async function listDocs(
  ...args: Parameters<ListDocs>
): Promise<Awaited<ReturnType<ListDocs>>> {
  const queries = await import("@knowledge-workspace/application/docs/queries.ts");
  return queries.listDocs(...args);
}

export async function loadWebEditDoc(
  ...args: Parameters<LoadWebEditDoc>
): Promise<Awaited<ReturnType<LoadWebEditDoc>>> {
  const editing = await import("@knowledge-workspace/application/docs/web-edit.ts");
  return editing.loadWebEditDoc(...args);
}

export async function saveWebEditDoc(
  ...args: Parameters<SaveWebEditDoc>
): Promise<Awaited<ReturnType<SaveWebEditDoc>>> {
  const editing = await import("@knowledge-workspace/application/docs/web-edit.ts");
  return editing.saveWebEditDoc(...args);
}
