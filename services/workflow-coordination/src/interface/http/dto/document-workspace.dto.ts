import type { FulcrumDocTreePage } from "@knowledge-workspace/domain/document-page-tree.ts";
import type {
  DocumentWorkspacePageOperationsInput,
} from "@workflow-coordination/application/document-workspace.service.ts";

export class DocumentWorkspacePageTreeRequestDto {
  pages!: FulcrumDocTreePage[];
  breadcrumbPageId?: string | null;
}

export class DocumentWorkspacePageOperationsRequestDto implements DocumentWorkspacePageOperationsInput {
  pages!: DocumentWorkspacePageOperationsInput["pages"];
  rootPageId!: string;
  accessibleTreePageIds!: string[];
  sidebar!: DocumentWorkspacePageOperationsInput["sidebar"];
  recent!: DocumentWorkspacePageOperationsInput["recent"];
}
