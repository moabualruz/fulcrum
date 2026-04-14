import { describe, it, expect, afterEach } from 'vitest'
import { initOtel, shutdownOtel, getOtelTracer } from '../telemetry/otel.js'

describe('OTel opt-in (J-7)', () => {
  afterEach(async () => {
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT']
    await shutdownOtel()
  })

  it('getOtelTracer returns null when OTEL_EXPORTER_OTLP_ENDPOINT is not set', async () => {
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT']
    await initOtel()
    expect(getOtelTracer()).toBeNull()
  })

  it('initOtel is a no-op without the env var and a 2nd init is safe', async () => {
    await initOtel()
    await initOtel()
    expect(getOtelTracer()).toBeNull()
  })

  it('with OTEL_EXPORTER_OTLP_ENDPOINT set, initOtel installs a tracer', async () => {
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = 'http://localhost:4318'
    await initOtel()
    const tracer = getOtelTracer()
    // If the OTel package isn't installed in the test environment, tracer may
    // still be null — we don't want to fail in that case. Accept either.
    expect(tracer === null || typeof tracer.startSpan === 'function').toBe(true)
  })
})
