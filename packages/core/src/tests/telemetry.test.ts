import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'
import { createWorkspace } from '../workspaces.js'
import { startSpan, endSpan, getTrace } from '../telemetry/spans.js'

describe('telemetry spans (G-12)', () => {
  beforeEach(async () => {
    closeDb()
    const db = new Database(':memory:')
    runMigrations(db)
    setDb(db)
    await createWorkspace({ workspace_id: 'ws_1', name: 'w' })
  })

  it('startSpan creates a row with status=started', async () => {
    const span = await startSpan({ name: 'plan', workspace_id: 'ws_1' })
    expect(span.span_id).toMatch(/^span_/)
    expect(span.trace_id).toBe(span.span_id) // root span → trace_id = span_id
    expect(span.status).toBe('started')
    expect(span.ended_at).toBeNull()
    expect(span.parent_span_id).toBeNull()
    expect(span.name).toBe('plan')
  })

  it('child span inherits trace_id from parent', async () => {
    const parent = await startSpan({ name: 'workflow', workspace_id: 'ws_1' })
    const child = await startSpan({ name: 'step', workspace_id: 'ws_1', parent_span_id: parent.span_id })
    expect(child.trace_id).toBe(parent.trace_id)
    expect(child.parent_span_id).toBe(parent.span_id)
  })

  it('deeply nested child inherits trace_id from grandparent', async () => {
    const root = await startSpan({ name: 'root', workspace_id: 'ws_1' })
    const mid = await startSpan({ name: 'mid', workspace_id: 'ws_1', parent_span_id: root.span_id })
    const leaf = await startSpan({ name: 'leaf', workspace_id: 'ws_1', parent_span_id: mid.span_id })
    expect(leaf.trace_id).toBe(root.trace_id)
  })

  it('endSpan updates status and ended_at', async () => {
    const span = await startSpan({ name: 'task', workspace_id: 'ws_1' })
    await endSpan({ span_id: span.span_id, status: 'ok' })
    const trace = await getTrace(span.trace_id)
    expect(trace.length).toBe(1)
    expect(trace[0]!.status).toBe('ok')
    expect(trace[0]!.ended_at).not.toBeNull()
  })

  it('endSpan merges payload if provided', async () => {
    const span = await startSpan({ name: 'task', workspace_id: 'ws_1', payload: { step: 1 } })
    await endSpan({ span_id: span.span_id, status: 'ok', payload: { duration_ms: 123 } })
    const trace = await getTrace(span.trace_id)
    const p = trace[0]!.payload!
    expect(p['duration_ms']).toBe(123)
    // Module documents merge semantics: start-time keys are preserved.
    expect(p['step']).toBe(1)
  })

  it('getTrace returns all spans in a trace ordered by started_at', async () => {
    const root = await startSpan({ name: 'root', workspace_id: 'ws_1' })
    await new Promise(r => setTimeout(r, 2))
    await startSpan({ name: 'child1', workspace_id: 'ws_1', parent_span_id: root.span_id })
    await new Promise(r => setTimeout(r, 2))
    await startSpan({ name: 'child2', workspace_id: 'ws_1', parent_span_id: root.span_id })
    const spans = await getTrace(root.trace_id)
    expect(spans.length).toBe(3)
    expect(spans[0]!.name).toBe('root')
    expect(spans[1]!.name).toBe('child1')
    expect(spans[2]!.name).toBe('child2')
  })

  it('endSpan with status=error is supported', async () => {
    const span = await startSpan({ name: 'failing', workspace_id: 'ws_1' })
    await endSpan({ span_id: span.span_id, status: 'error', payload: { error: 'boom' } })
    const trace = await getTrace(span.trace_id)
    expect(trace[0]!.status).toBe('error')
    expect(trace[0]!.payload!['error']).toBe('boom')
  })

  it('getTrace for unknown trace_id returns empty array', async () => {
    const spans = await getTrace('span_missing')
    expect(spans).toEqual([])
  })

  it('DB-only path works when OTel is not configured (J-7 regression)', async () => {
    // Ensure OTel is opt-out (no endpoint env var). The dual-emit code must
    // be a no-op, and the DB path must still behave identically.
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT']
    const { getOtelTracer } = await import('../telemetry/otel.js')
    expect(getOtelTracer()).toBeNull()
    const span = await startSpan({ name: 'noop.otel', workspace_id: 'ws_1', payload: { k: 'v' } })
    await endSpan({ span_id: span.span_id, status: 'ok', payload: { done: true } })
    const trace = await getTrace(span.trace_id)
    expect(trace.length).toBe(1)
    expect(trace[0]!.status).toBe('ok')
    expect(trace[0]!.payload!['k']).toBe('v')
    expect(trace[0]!.payload!['done']).toBe(true)
  })
})
