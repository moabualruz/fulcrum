# Telemetry

> Local spans by default, OTLP export when you want it, `gen_ai.*` semantic conventions throughout.

Fulcrum's telemetry layer is a thin wrapper around a SQLite table and an opt-in OpenTelemetry SDK. By default every span lands in `trace_events` and can be queried with plain SQL. Set `OTEL_EXPORTER_OTLP_ENDPOINT` and the same spans dual-emit to any OTLP/HTTP backend — Jaeger, Grafana Tempo, Honeycomb, Datadog, whatever.

---

## Local spans by default

All span APIs are re-exported from `fulcrum-core`. They're cheap enough that the runner and worker call them on every operation without asking the user to opt in.

```typescript
import { startSpan, endSpan, getTrace } from 'fulcrum-core'

const span = await startSpan({
  name:         'my.op',
  workspace_id: 'ws_1',
  payload:      { foo: 'bar' },
})

try {
  // ... do the work ...
  await endSpan({ span_id: span.span_id, status: 'ok' })
} catch (err) {
  await endSpan({
    span_id: span.span_id,
    status:  'error',
    payload: { error: (err as Error).message },
  })
  throw err
}
```

Spans are stored in the `trace_events` table. There is no "enable tracing" switch — the table is always there, the functions always write to it.

---

## Auto-instrumentation

Four call sites open spans for you automatically. You don't instrument the runner, the worker, the janitor, or the MCP tool handler yourself.

| Span name | Opened by | Key payload fields |
|-----------|-----------|--------------------|
| `workflow.run` | `runWorkflow` in `fulcrum-workflows` | `wf_id`, `final_status`, `steps_executed`, `duration_ms` |
| `workflow.step` | Per step inside `runWorkflow` | `step_id`, `step_type`, `attempts`, `result_status`, `error` |
| `agent.run` | `spawnAgent` in `fulcrum-worker` | `role`, `adapter`, `model`, `caller_role`, `status`, `summary`, `error` |
| `janitor.cycle` | Janitor reaping cycle in `fulcrum-core` | reaped run counts, duration |
| `mcp.tool` | `fulcrum serve mcp` tool handler | `tool_name`, `request_id`, `error` |

Span parenting is automatic. `workflow.step` spans pass `parent_span_id: runSpan.span_id`, so they nest under the `workflow.run` root. `agent.run` spans opened from inside a `spawn_agent` step inherit the workflow's `trace_id` via the normal parenting rules described below.

---

## Span shape

From `packages/core/src/telemetry/spans.ts`:

```typescript
interface TelemetrySpan {
  span_id:        string           // primary key
  trace_id:       string           // same as span_id for root spans
  parent_span_id: string | null    // null for root spans
  name:           string           // e.g. 'workflow.run', 'agent.run'
  workspace_id:   string           // scope for per-workspace queries
  run_id:         string | null    // optional agent_runs.run_id correlation
  status:         'started' | 'ok' | 'error'
  started_at:     string           // ISO timestamp
  ended_at:       string | null    // set by endSpan
  payload:        Record<string, unknown> | null
}
```

Payload merging: `endSpan` **merges** its payload over the existing one (`{ ...current, ...new }`). That means you can set start-time metadata in `startSpan` and end-time metrics in `endSpan` without losing either.

```typescript
// start: stash inputs
const span = await startSpan({
  name: 'db.query',
  workspace_id: 'ws_1',
  payload: { query: 'SELECT * FROM tasks', started_rows: 0 },
})

// ... run the query, get 42 rows ...

// end: add metrics — query is still there in the stored payload
await endSpan({
  span_id: span.span_id,
  status: 'ok',
  payload: { rows_returned: 42, duration_ms: 12 },
})

// Stored payload: { query: 'SELECT * FROM tasks', started_rows: 0, rows_returned: 42, duration_ms: 12 }
```

---

## Querying traces

`getTrace(trace_id)` returns every span in a trace, ordered by `started_at` then `span_id`:

```typescript
import { getTrace } from 'fulcrum-core'

const spans = await getTrace('span_root_abc')
for (const s of spans) {
  console.log(
    `${s.started_at}  ${s.name.padEnd(20)}  ${s.status.padEnd(6)}  ${s.span_id}`,
  )
}
```

For trace IDs you don't already have, walk up from a known span:

```typescript
import { getDb } from 'fulcrum-core'

const db = getDb()
const row = db.prepare(
  'SELECT trace_id FROM trace_events WHERE run_id = ? ORDER BY started_at ASC LIMIT 1',
).get('run_abc') as { trace_id: string } | undefined

if (row) {
  const spans = await getTrace(row.trace_id)
  // ...
}
```

Or raw SQL if you need it:

```bash
sqlite3 .fulcrum/fulcrum.db \
  "SELECT name, status, started_at, ended_at FROM trace_events
     WHERE workspace_id='ws_1' ORDER BY started_at DESC LIMIT 20"
```

---

## Opt-in OTLP export

Set one environment variable and spans dual-emit to OTLP/HTTP while also landing in `trace_events`:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_SERVICE_NAME=fulcrum        # optional, default 'fulcrum'
```

Activation is automatic at startup for the long-running CLI commands — `fulcrum serve mcp`, `fulcrum serve monitor`, and `fulcrum serve all` all call `initOtel()` in their warm-up path. `initOtel` is a no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` isn't set, so leaving it unset silently disables the OTLP sink without changing the rest of the code path.

Under the hood `initOtel` loads the OTel SDK lazily (only if the endpoint is set), constructs a `NodeTracerProvider` with a `BatchSpanProcessor` wrapping an `OTLPTraceExporter` pointed at `${endpoint}/v1/traces`, and registers it as the global tracer. `shutdownOtel()` flushes pending spans and tears down the provider.

If the SDK fails to load (e.g. because you pruned the `@opentelemetry/*` devDependencies), the error is logged to stderr but the local DB path keeps working. OTel is always best-effort.

---

## Supported backends

Any OTLP/HTTP receiver works. A few common configs:

### Jaeger (all-in-one)

```bash
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest

export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
fulcrum serve all
# Browse spans at http://localhost:16686
```

### Grafana Tempo (local)

```bash
# with the default tempo-local docker-compose
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
fulcrum serve monitor
```

Tempo speaks OTLP natively; spans land in the `tempo` datasource of your local Grafana.

### Honeycomb

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io
export OTEL_EXPORTER_OTLP_HEADERS="x-honeycomb-team=$HONEYCOMB_API_KEY"
export OTEL_SERVICE_NAME=fulcrum-prod
```

### Datadog / New Relic / OpenObserve

All of these speak OTLP/HTTP. Set `OTEL_EXPORTER_OTLP_ENDPOINT` to their collector URL and (if required) `OTEL_EXPORTER_OTLP_HEADERS` to your auth token. Same code path.

---

## Semantic conventions

`payloadToAttributes` in `packages/core/src/telemetry/otel.ts` maps Fulcrum payload fields to OTel attributes. For spans whose name starts with `agent.` or `workflow.step`, agent-related fields use the `gen_ai.*` semantic conventions; everything else lands under a `fulcrum.*` prefix.

| Payload field | OTel attribute (agent/workflow.step spans) | OTel attribute (other spans) |
|---------------|---------------------------------------------|------------------------------|
| `role` / `target_role` | `gen_ai.agent.name` | `fulcrum.role` |
| `model` | `gen_ai.request.model` | `fulcrum.model` |
| `adapter` | `gen_ai.system` (value: `fulcrum.<name>`) | `fulcrum.adapter` |
| `wf_id` | `fulcrum.wf_id` | `fulcrum.wf_id` |
| `step_type` | `fulcrum.step_type` | `fulcrum.step_type` |
| `error` | `fulcrum.error` | `fulcrum.error` |
| anything else (primitive) | `fulcrum.<key>` | `fulcrum.<key>` |
| anything else (object/array) | `fulcrum.<key>` (JSON-stringified) | same |

Non-primitive values are JSON-stringified so they survive the OTel attribute value constraints. Null/undefined values are skipped.

The `service.name` attribute comes from `OTEL_SERVICE_NAME` (default `fulcrum`) and is set on the tracer provider's `Resource`.

---

## Manual spans

Emitting a span from your own code — a custom adapter, a CLI plugin, a cron job — is straightforward:

```typescript
import { startSpan, endSpan } from 'fulcrum-core'

async function doThing(workspace_id: string): Promise<void> {
  const span = await startSpan({
    name:         'my.op',
    workspace_id,
    payload:      { input_size: 42 },
  })
  try {
    // ... the actual work ...
    await endSpan({
      span_id: span.span_id,
      status:  'ok',
      payload: { rows_processed: 100 },
    })
  } catch (err) {
    await endSpan({
      span_id: span.span_id,
      status:  'error',
      payload: { error: (err as Error).message },
    })
    throw err
  }
}
```

Always wrap the body in try/finally (or try/catch with re-throw) so `endSpan` runs even on the error path. A span with no `ended_at` stays in state `'started'` forever, which skews your duration dashboards.

---

## Parent/child chains

Pass `parent_span_id` to `startSpan` to nest the new span under an existing one. The `trace_id` is **inherited from the parent automatically** — `startSpan` looks up the parent's `trace_id` in `trace_events` and writes it to the new row so the whole chain shares one trace.

```typescript
const root = await startSpan({
  name: 'batch.process',
  workspace_id: 'ws_1',
})

for (const item of batch) {
  const child = await startSpan({
    name: 'batch.item',
    workspace_id: 'ws_1',
    parent_span_id: root.span_id,
    payload: { item_id: item.id },
  })
  try {
    await processItem(item)
    await endSpan({ span_id: child.span_id, status: 'ok' })
  } catch (err) {
    await endSpan({
      span_id: child.span_id,
      status: 'error',
      payload: { error: (err as Error).message },
    })
  }
}

await endSpan({ span_id: root.span_id, status: 'ok' })
```

Root spans have `parent_span_id: null` and `trace_id === span_id`.

---

## Graceful shutdown

`fulcrum serve mcp`, `fulcrum serve monitor`, and `fulcrum serve all` register SIGINT/SIGTERM handlers that call `shutdownOtel()` before exiting. That flushes the `BatchSpanProcessor` queue so any spans pending export aren't lost when you Ctrl-C the server.

If you embed `fulcrum-core` in a long-running process you wrote yourself, register the same handler:

```typescript
import { shutdownOtel } from 'fulcrum-core'

async function shutdown() {
  try { await shutdownOtel() } catch { /* best-effort */ }
  process.exit(0)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
```

`shutdownOtel` is a no-op when OTel wasn't initialised, so it's safe to call unconditionally.

---

## Debugging local traces

SQLite is your friend. The `trace_events` table is plain rows:

```bash
sqlite3 .fulcrum/fulcrum.db <<'SQL'
.mode column
.headers on

-- last 10 root spans
SELECT span_id, name, status, started_at, ended_at
  FROM trace_events
 WHERE parent_span_id IS NULL
 ORDER BY started_at DESC
 LIMIT 10;

-- full trace for a specific run
SELECT name, status, started_at, ended_at, payload
  FROM trace_events
 WHERE trace_id = 'span_root_abc'
 ORDER BY started_at;

-- slowest agent runs in the last hour
SELECT run_id,
       name,
       started_at,
       ended_at,
       (julianday(ended_at) - julianday(started_at)) * 86400 AS seconds
  FROM trace_events
 WHERE name = 'agent.run'
   AND ended_at IS NOT NULL
 ORDER BY seconds DESC
 LIMIT 10;
SQL
```

---

## Troubleshooting

### OTel endpoint unreachable

`initOtel` logs the failure to stderr and falls back to local-only mode. Your app keeps working — `startSpan` / `endSpan` still write to `trace_events`. Re-check the endpoint (is it on `/v1/traces`?), TLS settings, and any required auth headers. A quick sanity check is `curl -v $OTEL_EXPORTER_OTLP_ENDPOINT/v1/traces` — you want a 200/400 (not a connection error).

### Spans missing from the backend

Three things to check in order:

1. **Is the runner / worker actually being invoked?** An empty pipeline means no spans. Query `trace_events` locally first — if they're not there, they won't be in the remote backend either.
2. **Was the process killed without calling `shutdownOtel`?** The `BatchSpanProcessor` batches before exporting; an ungraceful exit drops the pending batch. Use SIGTERM (which the CLI handles) instead of SIGKILL.
3. **Are your attribute values too big?** OTel attribute values have size limits. The payload mapper JSON-stringifies complex values and truncates nothing — if you put a 10 MB blob in a payload, the backend may reject the span.

### Sanitising sensitive payloads

Treat span payloads like log lines. Don't stuff secrets, raw prompts, or PII into them. If you need to correlate an external request to a Fulcrum span, store the ID and let the external system own the sensitive content.

If you want a blanket guard, wrap `startSpan` in your own helper that filters payload keys before handing them off:

```typescript
const SENSITIVE = new Set(['api_key', 'secret', 'token', 'password'])

async function safeSpan(input: Parameters<typeof startSpan>[0]) {
  const payload = input.payload
    ? Object.fromEntries(
        Object.entries(input.payload).filter(([k]) => !SENSITIVE.has(k)),
      )
    : undefined
  return startSpan({ ...input, payload })
}
```

---

## Related

- [README.md](../../README.md) — top-level overview
- [installation.md](./installation.md) — `OTEL_EXPORTER_OTLP_ENDPOINT` and related env vars
- [workflow-authoring.md](./workflow-authoring.md) — `workflow.run` / `workflow.step` auto-instrumentation
- [worker-adapters.md](./worker-adapters.md) — `agent.run` spans and `gen_ai.*` attributes
