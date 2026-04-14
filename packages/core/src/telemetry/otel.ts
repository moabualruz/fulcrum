// packages/core/src/telemetry/otel.ts
// Opt-in OTel OTLP exporter. Active only when OTEL_EXPORTER_OTLP_ENDPOINT is set.
// Dual-emits Fulcrum spans to the local trace_events table AND to an OTLP sink.

import type { Span as OtelSpan, Tracer } from '@opentelemetry/api'

let _tracer: Tracer | null = null
let _sdk: unknown = null  // NodeTracerProvider instance; type kept loose

/**
 * Initialize the OTel SDK if OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * Idempotent — safe to call multiple times.
 */
export async function initOtel(): Promise<void> {
  if (_tracer) return
  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT']
  if (!endpoint) return

  const serviceName = process.env['OTEL_SERVICE_NAME'] ?? 'fulcrum'

  try {
    const { NodeTracerProvider, BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-node')
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')
    const { Resource } = await import('@opentelemetry/resources')
    const { ATTR_SERVICE_NAME } = await import('@opentelemetry/semantic-conventions')
    const { trace } = await import('@opentelemetry/api')

    const resource = new Resource({ [ATTR_SERVICE_NAME]: serviceName })
    const exporter = new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` })
    const provider = new NodeTracerProvider({ resource })
    provider.addSpanProcessor(new BatchSpanProcessor(exporter))
    provider.register()

    _sdk = provider
    _tracer = trace.getTracer('fulcrum', '0.0.1')
    process.stderr.write(`[fulcrum/otel] initialized, exporting to ${endpoint}\n`)
  } catch (err) {
    process.stderr.write(`[fulcrum/otel] init failed: ${(err as Error).message}\n`)
  }
}

export async function shutdownOtel(): Promise<void> {
  if (!_sdk) return
  try {
    const provider = _sdk as { shutdown: () => Promise<void> }
    await provider.shutdown()
  } catch { /* best-effort */ }
  _sdk = null
  _tracer = null
}

export function getOtelTracer(): Tracer | null {
  return _tracer
}

/**
 * Map a Fulcrum span payload into OTel attributes.
 * Agent-related fields use gen_ai.* semantic conventions where applicable.
 */
export function payloadToAttributes(name: string, payload: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  if (!payload) return {}
  const attrs: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      // Agent-run payloads get gen_ai.* prefixes where it makes sense
      if (name.startsWith('agent.') || name.startsWith('workflow.step')) {
        if (k === 'role' || k === 'target_role') attrs['gen_ai.agent.name'] = String(v)
        else if (k === 'model') attrs['gen_ai.request.model'] = String(v)
        else if (k === 'adapter') attrs['gen_ai.system'] = `fulcrum.${String(v)}`
        else attrs[`fulcrum.${k}`] = v
      } else {
        attrs[`fulcrum.${k}`] = v
      }
    } else {
      // Serialize complex values as JSON string
      try { attrs[`fulcrum.${k}`] = JSON.stringify(v) } catch { /* skip */ }
    }
  }
  return attrs
}

/**
 * Map from a Fulcrum span_id to the corresponding OTel span. Used by endSpan
 * so it can finalize the OTel side when the Fulcrum side ends.
 */
const _otelSpanBySpanId = new Map<string, OtelSpan>()

export function registerOtelSpan(span_id: string, otelSpan: OtelSpan): void {
  _otelSpanBySpanId.set(span_id, otelSpan)
}

export function popOtelSpan(span_id: string): OtelSpan | undefined {
  const s = _otelSpanBySpanId.get(span_id)
  _otelSpanBySpanId.delete(span_id)
  return s
}
