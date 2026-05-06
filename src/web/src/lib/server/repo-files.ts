import type { LegacyDatabaseHandle } from "./application-compat";
import {
  listTreeChildren,
  getFileByPath,
  getFileContent,
  getBlameForFile,
  listIndexedBranches,
  type RepoFileRow,
  type RepoFileBlameRow,
  type RepoFileContentRow,
} from "./application-compat";

export type { RepoFileRow, RepoFileBlameRow, RepoFileContentRow };

/** Determine MIME category for rendering decision. */
export function fileMimeCategory(
  mime: string | null,
  path: string,
): "image" | "text" | "binary" {
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("text/")) return "text";

  // Infer from extension
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

  // Fallback: if content is available and non-null, treat as text
  return "binary";
}

/** Map file extension to Shiki language id. */
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

export { listTreeChildren, getFileByPath, getFileContent, getBlameForFile, listIndexedBranches };
