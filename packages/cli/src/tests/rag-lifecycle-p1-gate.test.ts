import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TOOL_REGISTRY } from '../tool-registry.js'

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))

function readRepoFile(path: string): string {
  return readFileSync(`${repoRoot}/${path}`, 'utf8')
}

describe('RAG lifecycle P1 shipping gate', () => {
  it('keeps P1 rebuild, embedding job, and explain surfaces available without depending on P2 health/eval modules', () => {
    const p1Tools = [
      'get_rag_rebuild_plan',
      'get_rag_rebuild_dry_run',
      'start_rag_rebuild',
      'get_rag_rebuild_report',
      'start_embedding_job',
      'get_embedding_job_status',
      'get_embedding_job_logs',
      'cancel_embedding_job',
      'resume_embedding_job',
      'retry_embedding_job_failed',
      'recall_knowledge',
    ]
    for (const tool of p1Tools) expect(TOOL_REGISTRY.has(tool)).toBe(true)

    for (const file of [
      'packages/cli/src/commands/memory-rag-lifecycle.ts',
      'packages/cli/src/commands/memory-embedding-jobs.ts',
      'packages/cli/src/commands/memory-recall.ts',
    ]) {
      const source = readRepoFile(file)
      expect(source).not.toMatch(/memory-rag-health|memory-rag-eval|buildRagHealthReport|runRagLifecycleEvalSuite/)
    }
  })
})
