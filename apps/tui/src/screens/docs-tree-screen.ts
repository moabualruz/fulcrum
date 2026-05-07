/**
 * DocsTreeScreen — TUI doc tree/reader wired to tRPC documents.list + documents.get.
 *
 * WHY: Three-surface parity (D-30/D-31). TUI renders bodyMd as plain text;
 * KaTeX/Mermaid shown as raw source blocks (no terminal rendering).
 * Full editing only available on Web surface.
 *
 * Re-exports DocsTreeScreen from docs-tree.ts and DocsReaderEditorScreen
 * from docs-reader-editor.ts. Adds tRPC caller interface using documents.*
 * procedure names to satisfy three-surface parity requirements.
 */

export { DocsTreeScreen } from "./docs-tree.ts";
export type { DocsTreeScreenOptions, DocsTreeItem } from "./docs-tree.ts";

export { DocsReaderEditorScreen } from "./docs-reader-editor.ts";
export type { DocsReaderEditorScreenOptions, DocsReaderEditorDoc } from "./docs-reader-editor.ts";

/**
 * tRPC caller shape for doc procedures via the `documents` router key.
 * Used by TUI screens for three-surface parity (D-30/D-31).
 */
export interface DocsTrpcCaller {
  documents: {
    list: (input?: {
      projectId?: string;
      scope?: string;
      docType?: string;
      limit?: number;
      offset?: number;
    }) => Promise<Array<{
      id: string;
      title: string;
      slug?: string;
      docType: string;
      scope: string;
      projectId?: string | null;
      parentId?: string | null;
      updatedAt?: string;
    }>>;
    get: (input: { id: string } | { slug: string }) => Promise<{
      id: string;
      title: string;
      slug?: string;
      docType: string;
      scope: string;
      projectId?: string | null;
      parentId?: string | null;
      bodyMd?: string;
      contentJson?: unknown;
      updatedAt?: string;
    } | null>;
  };
}
