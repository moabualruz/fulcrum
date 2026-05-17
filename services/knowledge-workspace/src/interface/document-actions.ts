export type {
  CreateDocumentInput,
  UpdateDocumentInput,
} from "@knowledge-workspace/application/document-actions.ts";

type CreateDocumentAction = typeof import("@knowledge-workspace/application/document-actions.ts").createDocumentAction;
type DeleteDocumentAction = typeof import("@knowledge-workspace/application/document-actions.ts").deleteDocumentAction;
type UpdateDocumentAction = typeof import("@knowledge-workspace/application/document-actions.ts").updateDocumentAction;

export async function createDocumentAction(
  ...args: Parameters<CreateDocumentAction>
): Promise<Awaited<ReturnType<CreateDocumentAction>>> {
  const actions = await import("@knowledge-workspace/application/document-actions.ts");
  return actions.createDocumentAction(...args);
}

export async function updateDocumentAction(
  ...args: Parameters<UpdateDocumentAction>
): Promise<Awaited<ReturnType<UpdateDocumentAction>>> {
  const actions = await import("@knowledge-workspace/application/document-actions.ts");
  return actions.updateDocumentAction(...args);
}

export async function deleteDocumentAction(
  ...args: Parameters<DeleteDocumentAction>
): Promise<Awaited<ReturnType<DeleteDocumentAction>>> {
  const actions = await import("@knowledge-workspace/application/document-actions.ts");
  return actions.deleteDocumentAction(...args);
}
