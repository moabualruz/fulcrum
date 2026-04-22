import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  RAG_EVAL_GATE_PATH_PATTERNS,
  isRagEvalGateRequiredForPaths,
} from '../commands/memory-rag-eval.js'

describe('RAG eval CI path gate', () => {
  it('requires the gate for RAG lifecycle, memory, code search, embeddings, graph, and eval fixture paths', () => {
    expect(isRagEvalGateRequiredForPaths([
      'packages/memory/package.json',
      'packages/memory/src/index.ts',
      'packages/memory/src/eval/rag-lifecycle/fixtures.ts',
      'packages/memory/src/retrieval/search-code.ts',
      'packages/memory/src/l2/embedding-jobs.ts',
      'packages/memory/src/kuzu/graph.ts',
      'packages/core/src/db/schema.ts',
      'packages/cli/src/commands/memory-rag-eval.ts',
    ])).toBe(true)
  })

  it('skips unrelated non-RAG paths', () => {
    expect(isRagEvalGateRequiredForPaths([
      'docs/guides/workflow-authoring.md',
      'packages/policy/src/engine.ts',
      'packages/monitor/src/tests/monitor.test.ts',
    ])).toBe(false)
  })

  it('keeps workflow paths aligned with the default local rag-lifecycle suite', () => {
    const workflowPath = fileURLToPath(new URL('../../../../.github/workflows/memory-eval.yml', import.meta.url))
    const workflow = readFileSync(workflowPath, 'utf8')

    expect(workflow).toContain('pnpm --filter fulcrum-memory eval:rag-lifecycle')
    for (const pattern of RAG_EVAL_GATE_PATH_PATTERNS) {
      expect(workflow).toContain(pattern)
    }
  })
})
