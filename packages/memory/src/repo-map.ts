// packages/memory/src/repo-map.ts
// Aider-style repo map: walks a directory tree and extracts top-level symbols
// (functions, classes, methods) from TypeScript/JavaScript source files using
// the injected tree-sitter parser. Falls back to file-only listing when the
// parser is not available or a file cannot be parsed.
//
// Usage:
//   const map = buildRepoMap(files, parser)    // files + parser provided by caller
//   const map = await scanAndBuildRepoMap(dir) // async, real file system walk

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, extname } from 'path'
import type { TreeSitterParser, SyntaxNode, ParseTree } from './chunkers/ast-chunker.js'

// ---------- Public types ----------

export interface RepoSymbol {
  name: string
  kind: 'function' | 'class' | 'method' | 'arrow' | 'const' | 'other'
  line: number
}

export interface RepoFileEntry {
  path: string        // Relative to root
  language: string
  symbols: RepoSymbol[]
}

export interface RepoMap {
  root: string
  files: RepoFileEntry[]
  /** Flat summary string for prompt injection. */
  summary: string
}

// ---------- Language detection ----------

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.rb': 'ruby',
}

const PARSEABLE_LANGUAGES = new Set(['typescript', 'tsx', 'javascript', 'jsx'])

function languageForFile(file: string): string {
  const ext = extname(file).toLowerCase()
  return EXT_TO_LANGUAGE[ext] ?? 'unknown'
}

// ---------- Symbol extraction ----------

// AST node types → symbol kind mapping
const NODE_KIND_MAP: Record<string, RepoSymbol['kind']> = {
  function_declaration: 'function',
  function_expression: 'function',
  generator_function_declaration: 'function',
  class_declaration: 'class',
  class_expression: 'class',
  method_definition: 'method',
  arrow_function: 'arrow',
  lexical_declaration: 'const',
}

/** Calculate 1-based line number of a byte offset in source. */
function lineOf(source: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line++
  }
  return line
}

/** Extract the identifier/name for a declaration node. */
function extractName(node: SyntaxNode): string | undefined {
  for (const child of node.children) {
    if (child.type === 'identifier' || child.type === 'property_identifier') return child.text
  }
  // For lexical_declaration (const foo = ...) — look deeper
  for (const child of node.children) {
    if (child.type === 'variable_declarator') {
      for (const sub of child.children) {
        if (sub.type === 'identifier') return sub.text
      }
    }
  }
  return undefined
}

/** Walk AST root and collect top-level and class-level declaration nodes. */
function collectDeclarations(rootNode: SyntaxNode, source: string): RepoSymbol[] {
  const symbols: RepoSymbol[] = []

  function walk(node: SyntaxNode, depth: number): void {
    if (depth > 4) return  // Don't descend into deeply nested blocks

    const kind = NODE_KIND_MAP[node.type]
    if (kind) {
      // Only collect if it has a name (skip anonymous functions etc.)
      const name = extractName(node)
      if (name) {
        symbols.push({ name, kind, line: lineOf(source, node.startIndex) })
      }
    }

    for (const child of node.children) {
      // Descend into class bodies, export declarations, and statement blocks
      if (
        child.type === 'class_body' ||
        child.type === 'export_statement' ||
        child.type === 'export_default_declaration' ||
        child.type === 'program' ||
        child.type === 'module'
      ) {
        walk(child, depth)  // same depth — structural wrappers
      } else {
        walk(child, depth + 1)
      }
    }
  }

  walk(rootNode, 0)
  return symbols
}

function extractSymbols(source: string, parser: TreeSitterParser): RepoSymbol[] {
  let tree: ParseTree
  try {
    tree = parser.parse(source)
  } catch {
    return []
  }
  return collectDeclarations(tree.rootNode, source)
}

// ---------- Directory walker ----------

const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'worktrees', 'dist', 'build', '.next', 'coverage'])
const MAX_FILE_SIZE = 512 * 1024  // 512 KB — skip very large generated files

function walkDir(dir: string, root: string): string[] {
  const results: string[] = []
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.' ) {
      // Skip hidden files except specific ones we want
      const keep = ['.ts', '.js'].some(ext => entry.name.endsWith(ext))
      if (!keep && entry.isDirectory()) continue
    }
    if (SKIP_DIRS.has(entry.name)) continue

    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, root))
    } else if (entry.isFile()) {
      const lang = languageForFile(entry.name)
      if (lang !== 'unknown') results.push(fullPath)
    }
  }
  return results
}

// ---------- Core builders ----------

/**
 * Build a RepoMap from a pre-collected list of absolute file paths.
 * The `root` param is used to compute relative paths in the output.
 * Pass a `TreeSitterParser` to get symbol extraction; omit for file-only map.
 */
export function buildRepoMap(
  files: string[],
  root: string,
  parser?: TreeSitterParser,
): RepoMap {
  const entries: RepoFileEntry[] = []

  for (const filePath of files) {
    const language = languageForFile(filePath)
    const relPath = relative(root, filePath)
    let symbols: RepoSymbol[] = []

    if (parser && PARSEABLE_LANGUAGES.has(language)) {
      try {
        const stat = statSync(filePath)
        if (stat.size <= MAX_FILE_SIZE) {
          const source = readFileSync(filePath, 'utf8')
          symbols = extractSymbols(source, parser)
        }
      } catch {
        // Unreadable file — include without symbols
      }
    }

    entries.push({ path: relPath, language, symbols })
  }

  const summary = buildSummaryText(entries)
  return { root, files: entries, summary }
}

/**
 * Async convenience: scan `dir`, walk all source files, build the map.
 */
export async function scanAndBuildRepoMap(
  dir: string,
  parser?: TreeSitterParser,
): Promise<RepoMap> {
  const files = walkDir(dir, dir)
  return buildRepoMap(files, dir, parser)
}

// ---------- Summary text ----------

function buildSummaryText(entries: RepoFileEntry[]): string {
  const lines: string[] = []
  for (const entry of entries) {
    if (entry.symbols.length === 0) {
      lines.push(entry.path)
    } else {
      const syms = entry.symbols.map(s => `${s.name}:${s.line}`).join(', ')
      lines.push(`${entry.path}  [${syms}]`)
    }
  }
  return lines.join('\n')
}
