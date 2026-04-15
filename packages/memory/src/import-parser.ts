// packages/memory/src/import-parser.ts
// Pure utility: parse local import paths from TypeScript/JavaScript source.
// No local dependencies — safe to import from anywhere in this package.

/**
 * Parse local import paths from TypeScript/JavaScript source content.
 * Returns only paths starting with '.' or '/' (skips npm package names).
 * Handles:
 *   import ... from '...'
 *   require('...')
 *   export ... from '...'
 */
export function parseLocalImports(content: string): string[] {
  const results: string[] = []

  // import ... from '...' or "..."
  // Also handles: import '...' (side-effect imports)
  const importFrom = /\bimport\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g
  // require('...') or require("...")
  const requireCall = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  // export ... from '...' or "..."
  const exportFrom = /\bexport\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g

  for (const re of [importFrom, requireCall, exportFrom]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      const path = m[1]!
      if (path.startsWith('.') || path.startsWith('/')) {
        results.push(path)
      }
    }
  }

  // Deduplicate while preserving first-seen order
  return [...new Set(results)]
}
