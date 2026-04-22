import { describe, expect, it } from 'vitest'
import { TOOL_SCHEMA_MAP } from '../mcp-tools.js'
import { TOOL_REGISTRY } from '../tool-registry.js'

describe('RAG lifecycle integration utilization', () => {
  it('wires CLI registry entries to their MCP schemas', () => {
    for (const name of [
      'get_rag_rebuild_plan',
      'get_rag_rebuild_dry_run',
      'start_rag_rebuild',
      'get_rag_rebuild_report',
      'get_rag_health',
      'start_embedding_job',
      'get_embedding_job_status',
      'get_embedding_job_logs',
      'cancel_embedding_job',
      'resume_embedding_job',
      'retry_embedding_job_failed',
    ]) {
      const entry = TOOL_REGISTRY.get(name)
      expect(entry?.schema).toBe(TOOL_SCHEMA_MAP.get(name))
      expect(typeof entry?.handler).toBe('function')
    }
  })
})
