import type {
  FileTreeNode,
  RepoFileBlameRow,
  RepoFileContentRow,
  RepoFileRow,
} from "@integration-hub/application/repo-files/queries.ts";
import { initDataSource } from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import type { RepositoryRequestContextInput } from "./repository-pages.ts";

export type {
  FileTreeNode,
  RepoFileBlameRow,
  RepoFileContentRow,
  RepoFileRow,
};

export async function loadRepositoryFilesPage(
  contextInput: RepositoryRequestContextInput,
  input: { repoId: string; filePath: string },
) {
  const service = await import("@integration-hub/application/repo-files/queries.ts");
  const { em, ctx } = await repositoryScope(contextInput);
  return service.getRepoFilesPage(em, ctx, input);
}

export async function loadRepositoryFileDetail(
  contextInput: RepositoryRequestContextInput,
  input: { repoId: string; branch?: string; filePath: string; showBlame: boolean },
) {
  const service = await import("@integration-hub/application/repo-files/queries.ts");
  const { em, ctx } = await repositoryScope(contextInput);
  return service.getRepoFileDetailPage(em, ctx, input);
}

export async function listRepositoryTreeChildren(
  contextInput: RepositoryRequestContextInput,
  repoId: string,
  branch: string,
  parentPath: string | null,
): Promise<RepoFileRow[]> {
  const service = await import("@integration-hub/application/repo-files/queries.ts");
  const { em, ctx } = await repositoryScope(contextInput);
  return service.listTreeChildren(em, ctx, repoId, branch, parentPath);
}

export function fileMimeCategory(
  mime: string | null,
  path: string,
): "image" | "text" | "binary" {
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("text/")) return "text";

  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const textExts = new Set([
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
    "json", "jsonc", "yaml", "yml", "toml",
    "md", "mdx", "txt", "csv", "tsv",
    "html", "htm", "css", "scss", "less",
    "xml", "svg", "sql", "sh", "bash", "zsh",
    "py", "rb", "rs", "go", "java", "kt", "swift",
    "c", "cpp", "h", "hpp", "cs", "php",
    "vue", "svelte", "astro",
    "dockerfile", "makefile", "justfile",
    "env", "gitignore", "editorconfig",
    "lock", "sum",
  ]);
  const imageExts = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"]);

  if (imageExts.has(ext)) return "image";
  if (textExts.has(ext)) return "text";
  return "binary";
}

export function shikiLangFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    mjs: "javascript", cjs: "javascript",
    json: "json", jsonc: "jsonc", yaml: "yaml", yml: "yaml",
    toml: "toml", md: "markdown", mdx: "mdx",
    html: "html", htm: "html", css: "css", scss: "scss", less: "less",
    xml: "xml", svg: "xml", sql: "sql",
    sh: "bash", bash: "bash", zsh: "bash",
    py: "python", rb: "ruby", rs: "rust", go: "go",
    java: "java", kt: "kotlin", swift: "swift",
    c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp", php: "php",
    vue: "vue", svelte: "svelte", astro: "astro",
    dockerfile: "dockerfile", makefile: "makefile",
    txt: "text",
  };
  return map[ext] ?? "text";
}

async function repositoryScope(input: RepositoryRequestContextInput) {
  return {
    em: (await initDataSource()).manager,
    ctx: {
      orgId: input.orgId,
      userId: input.userId ?? null,
      projectId: input.projectId ?? null,
    },
  };
}
