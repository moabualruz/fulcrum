import { getDb } from 'fulcrum-agent-core'
import type { Db } from 'fulcrum-agent-core'
import type { RagParityCheck, RagRebuildDomain } from './rag-types.js'

function count(db: Db, sql: string, ...params: unknown[]): number {
  try {
    const row = db.prepare(sql).get(...params) as { n: number } | undefined
    return row?.n ?? 0
  } catch {
    return 0
  }
}

function pass(name: string, actual = 0, expected = 0): RagParityCheck {
  return { name, status: 'pass', expected, actual }
}

function fail(name: string, actual: number, expected = 0): RagParityCheck {
  return { name, status: 'fail', expected, actual }
}

export function runRebuildParityChecks(
  input: { workspace_id: string; project_id: string; domains: RagRebuildDomain[] },
  db: Db = getDb(),
): RagParityCheck[] {
  const checks: RagParityCheck[] = []
  const { workspace_id, project_id } = input

  if (input.domains.includes('fts') || input.domains.includes('l1')) {
    for (const table of ['memories_fts', 'code_chunks_fts']) {
      try {
        db.prepare(`INSERT INTO ${table}(${table}) VALUES ('integrity-check')`).run()
        checks.push(pass(`${table}_integrity`))
      } catch (err) {
        checks.push({ name: `${table}_integrity`, status: 'fail', expected: 0, actual: 1, details: (err as Error).message })
      }
    }
  }

  if (input.domains.includes('code')) {
    const orphanChunks = count(db, `
      SELECT COUNT(*) AS n
      FROM code_chunks c
      LEFT JOIN code_files f ON f.file_id = c.file_id AND f.workspace_id = c.workspace_id
      WHERE c.workspace_id = ? AND c.project_id = ? AND c.file_id IS NOT NULL AND f.file_id IS NULL
    `, workspace_id, project_id)
    checks.push(orphanChunks === 0 ? pass('code_chunks_file_id') : fail('code_chunks_file_id', orphanChunks))

    const chunkMismatches = count(db, `
      SELECT COUNT(*) AS n
      FROM code_files f
      WHERE f.workspace_id = ? AND f.project_id = ?
        AND f.chunks_count != (
          SELECT COUNT(*) FROM code_chunks c
          WHERE c.workspace_id = f.workspace_id AND c.project_id = f.project_id AND c.file_id = f.file_id
        )
    `, workspace_id, project_id)
    checks.push(chunkMismatches === 0 ? pass('code_files_chunk_counts') : fail('code_files_chunk_counts', chunkMismatches))
  }

  if (input.domains.includes('vectors')) {
    const missingMemorySources = count(db, `
      SELECT COUNT(*) AS n
      FROM vector_metadata v
      LEFT JOIN memories m ON m.memory_id = v.source_id AND m.workspace_id = v.workspace_id
      WHERE v.workspace_id = ? AND v.source_domain = 'memory' AND m.memory_id IS NULL
    `, workspace_id)
    checks.push(missingMemorySources === 0 ? pass('vector_metadata_memory_sources') : fail('vector_metadata_memory_sources', missingMemorySources))

    const missingCodeSources = count(db, `
      SELECT COUNT(*) AS n
      FROM vector_metadata v
      LEFT JOIN code_chunks c ON c.chunk_id = v.source_id AND c.workspace_id = v.workspace_id
      WHERE v.workspace_id = ? AND v.source_domain = 'code_chunk' AND c.chunk_id IS NULL
    `, workspace_id)
    checks.push(missingCodeSources === 0 ? pass('vector_metadata_code_sources') : fail('vector_metadata_code_sources', missingCodeSources))
  }

  if (input.domains.includes('graph')) {
    const brokenEdges = count(db, `
      SELECT COUNT(*) AS n
      FROM graph_edges e
      LEFT JOIN graph_entities s ON s.entity_id = e.source_id AND s.workspace_id = e.workspace_id
      LEFT JOIN graph_entities t ON t.entity_id = e.target_id AND t.workspace_id = e.workspace_id
      WHERE e.workspace_id = ? AND (s.entity_id IS NULL OR t.entity_id IS NULL)
    `, workspace_id)
    checks.push(brokenEdges === 0 ? pass('graph_edges_entities') : fail('graph_edges_entities', brokenEdges))
  }

  return checks
}
