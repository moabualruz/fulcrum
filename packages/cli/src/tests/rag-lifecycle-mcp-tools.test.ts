import { describe, expect, it } from 'vitest'
import { TOOL_SCHEMAS } from '../mcp-tools.js'
import { TOOL_REGISTRY } from '../tool-registry.js'

const byName = new Map(TOOL_SCHEMAS.map(tool => [tool.name, tool]))

describe('RAG lifecycle MCP tool metadata', () => {
  it('registers snake_case RAG lifecycle tool schemas', () => {
    for (const name of [
      'get_rag_rebuild_plan',
      'get_rag_rebuild_dry_run',
      'start_rag_rebuild',
      'get_runtime_profile_paths',
      'get_rag_rebuild_report',
      'get_rag_health',
      'start_embedding_job',
      'get_embedding_job_status',
      'get_embedding_job_logs',
      'cancel_embedding_job',
      'resume_embedding_job',
      'retry_embedding_job_failed',
    ]) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(byName.get(name), `${name} schema should exist`).toBeDefined()
      expect(TOOL_REGISTRY.get(name), `${name} registry entry should exist`).toBeDefined()
    }
  })

  it('uses read-only and destructive hints that match registry capabilities', () => {
    expect(byName.get('get_rag_rebuild_plan')?.annotations?.readOnlyHint).toBe(true)
    expect(TOOL_REGISTRY.get('get_rag_rebuild_plan')?.capabilities.readOnly).toBe(true)

    expect(byName.get('get_rag_rebuild_dry_run')?.annotations?.readOnlyHint).toBe(true)
    expect(TOOL_REGISTRY.get('get_rag_rebuild_dry_run')?.capabilities.readOnly).toBe(true)

    expect(byName.get('get_rag_rebuild_report')?.annotations?.readOnlyHint).toBe(true)
    expect(TOOL_REGISTRY.get('get_rag_rebuild_report')?.capabilities.readOnly).toBe(true)

    expect(byName.get('get_runtime_profile_paths')?.annotations?.readOnlyHint).toBe(true)
    expect(TOOL_REGISTRY.get('get_runtime_profile_paths')?.capabilities.readOnly).toBe(true)

    expect(byName.get('get_rag_health')?.annotations?.readOnlyHint).toBe(true)
    expect(TOOL_REGISTRY.get('get_rag_health')?.capabilities.readOnly).toBe(true)

    expect(byName.get('start_rag_rebuild')?.annotations?.destructiveHint).toBe(true)
    expect(TOOL_REGISTRY.get('start_rag_rebuild')?.capabilities.destructive).toBe(true)

    expect(byName.get('get_embedding_job_status')?.annotations?.readOnlyHint).toBe(true)
    expect(TOOL_REGISTRY.get('get_embedding_job_status')?.capabilities.readOnly).toBe(true)

    expect(byName.get('get_embedding_job_logs')?.annotations?.readOnlyHint).toBe(true)
    expect(TOOL_REGISTRY.get('get_embedding_job_logs')?.capabilities.readOnly).toBe(true)

    for (const name of ['start_embedding_job', 'cancel_embedding_job', 'resume_embedding_job', 'retry_embedding_job_failed']) {
      expect(byName.get(name)?.annotations?.destructiveHint).toBe(true)
      expect(TOOL_REGISTRY.get(name)?.capabilities.destructive).toBe(true)
    }
  })

  it('does not accept caller-supplied actor identity on destructive MCP tools', () => {
    const properties = byName.get('start_rag_rebuild')?.inputSchema.properties ?? {}
    expect(properties).not.toHaveProperty('actor')
    expect(properties).toHaveProperty('runtime_profile')
    expect(byName.get('get_rag_rebuild_report')?.inputSchema.properties ?? {}).toHaveProperty('runtime_profile')
    for (const name of ['start_embedding_job', 'cancel_embedding_job', 'resume_embedding_job', 'retry_embedding_job_failed']) {
      expect(byName.get(name)?.inputSchema.properties ?? {}).not.toHaveProperty('actor')
    }
  })
})
