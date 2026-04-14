// packages/core/src/telemetry/spans.ts
// Minimal span scaffold for multi-agent workflow tracing (G-12, spec §19).
// Spans are stored in the `trace_events` table; root spans have trace_id === span_id.
// Payload semantics: on endSpan, a provided payload is MERGED over the existing
// payload (shallow {...current, ...new}). This lets callers attach start-time
// metadata in startSpan and end-time metrics in endSpan without losing either.
import { getDb } from '../db/client.js'
import { newId } from '../ids.js'
import type { TelemetrySpan } from '../types.js'
import { getOtelTracer, payloadToAttributes, registerOtelSpan, popOtelSpan } from './otel.js'

export interface StartSpanInput {
  name: string
  workspace_id: string
  parent_span_id?: string
  run_id?: string
  payload?: Record<string, unknown>
}

export interface EndSpanInput {
  span_id: string
  status: 'ok' | 'error'
  payload?: Record<string, unknown>
}

function rowToSpan(row: Record<string, unknown>): TelemetrySpan {
  return {
    span_id: row['span_id'] as string,
    trace_id: row['trace_id'] as string,
    parent_span_id: (row['parent_span_id'] as string | null) ?? null,
    name: row['name'] as string,
    workspace_id: row['workspace_id'] as string,
    run_id: (row['run_id'] as string | null) ?? null,
    status: row['status'] as TelemetrySpan['status'],
    started_at: row['started_at'] as string,
    ended_at: (row['ended_at'] as string | null) ?? null,
    payload: row['payload'] ? JSON.parse(row['payload'] as string) : null,
  }
}

export async function startSpan(input: StartSpanInput): Promise<TelemetrySpan> {
  const db = getDb()
  const span_id = newId('span')
  let trace_id = span_id
  if (input.parent_span_id) {
    const parent = db.prepare(
      `SELECT trace_id FROM trace_events WHERE span_id = ?`
    ).get(input.parent_span_id) as { trace_id: string } | undefined
    if (parent) trace_id = parent.trace_id
  }
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO trace_events (span_id, trace_id, parent_span_id, name, workspace_id, run_id, status, started_at, ended_at, payload)
     VALUES (?, ?, ?, ?, ?, ?, 'started', ?, NULL, ?)`
  ).run(
    span_id,
    trace_id,
    input.parent_span_id ?? null,
    input.name,
    input.workspace_id,
    input.run_id ?? null,
    now,
    input.payload ? JSON.stringify(input.payload) : null,
  )
  const row = db.prepare(
    `SELECT * FROM trace_events WHERE span_id = ?`
  ).get(span_id) as Record<string, unknown>

  // Dual-emit to OTel if a tracer is installed (opt-in via OTEL_EXPORTER_OTLP_ENDPOINT).
  const tracer = getOtelTracer()
  if (tracer) {
    try {
      const otelSpan = tracer.startSpan(input.name, {
        attributes: payloadToAttributes(input.name, input.payload ?? {}),
      })
      registerOtelSpan(span_id, otelSpan)
    } catch { /* best-effort, never fail the DB path */ }
  }

  return rowToSpan(row)
}

export async function endSpan(input: EndSpanInput): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()
  if (input.payload) {
    const existing = db.prepare(
      `SELECT payload FROM trace_events WHERE span_id = ?`
    ).get(input.span_id) as { payload: string | null } | undefined
    const current = existing?.payload ? JSON.parse(existing.payload) : {}
    const merged = { ...current, ...input.payload }
    db.prepare(
      `UPDATE trace_events SET status = ?, ended_at = ?, payload = ? WHERE span_id = ?`
    ).run(input.status, now, JSON.stringify(merged), input.span_id)
  } else {
    db.prepare(
      `UPDATE trace_events SET status = ?, ended_at = ? WHERE span_id = ?`
    ).run(input.status, now, input.span_id)
  }

  // Dual-emit: finalize the matching OTel span, if any.
  const otelSpan = popOtelSpan(input.span_id)
  if (otelSpan) {
    try {
      if (input.payload) {
        const attrs = payloadToAttributes('', input.payload)
        for (const [k, v] of Object.entries(attrs)) otelSpan.setAttribute(k, v)
      }
      if (input.status === 'error') {
        const { SpanStatusCode } = await import('@opentelemetry/api')
        otelSpan.setStatus({ code: SpanStatusCode.ERROR })
      }
      otelSpan.end()
    } catch { /* best-effort */ }
  }
}

export async function getTrace(trace_id: string): Promise<TelemetrySpan[]> {
  const rows = getDb().prepare(
    `SELECT * FROM trace_events WHERE trace_id = ? ORDER BY started_at ASC, span_id ASC`
  ).all(trace_id) as Record<string, unknown>[]
  return rows.map(rowToSpan)
}
