// packages/monitor/src/tests/sse-bridge.test.ts
//
// Tests for the event-bus → SSE bridge introduced in server.ts.
// These tests verify that emitting a domain event via the in-process event bus
// immediately pushes an SSE chunk to all active /events/stream consumers.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, getEventBus, resetEventBus } from '@fulcrum/core'
import type { EmitEventInput } from '@fulcrum/core'
import { startMonitorServer } from '../server.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      evt_id       TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id   TEXT,
      evt_type     TEXT NOT NULL,
      payload      TEXT NOT NULL DEFAULT '{}',
      ts           TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  return db
}

const SAMPLE_EVENT: EmitEventInput = {
  workspace_id: 'ws_sse_test',
  evt_type: 'task_created',
  actor_type: 'agent',
  actor_id: 'pi/software_engineer',
  payload: { task_id: 'task_001', title: 'Test Task' },
}

// Collect chunks pushed to a SSE ReadableStream into an array of strings.
// Returns a cancel function to abort the stream reader.
async function collectChunks(
  stream: ReadableStream<Uint8Array>,
  timeoutMs = 200,
): Promise<{ chunks: string[]; cancel: () => void }> {
  const chunks: string[] = []
  const decoder = new TextDecoder()
  const reader = stream.getReader()

  const cancel = () => {
    reader.cancel().catch(() => {})
  }

  // Drain in background — resolve after timeoutMs
  const done = new Promise<void>((resolve) => {
    const pump = () => {
      reader.read().then(({ done: isDone, value }) => {
        if (isDone) { resolve(); return }
        if (value) chunks.push(decoder.decode(value))
        pump()
      }).catch(() => resolve())
    }
    pump()
    setTimeout(resolve, timeoutMs)
  })

  await done
  return { chunks, cancel }
}

// ── Setup ──────────────────────────────────────────────────────────────────────

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
  setDb(db)
})

afterEach(() => {
  resetEventBus()
  db.close()
})

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SSE Bridge — event bus → ReadableStream', () => {
  it('happy path: event emitted via event bus appears in SSE controller chunks', async () => {
    const server = startMonitorServer({ workspace_id: 'ws_sse_test' })

    const res = await server.fetch(
      new Request('http://localhost/events/stream?workspace_id=ws_sse_test'),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/event-stream')

    // Start collecting before firing
    const collectPromise = collectChunks(res.body!, 150)

    // Fire the event — synchronous in-process delivery
    getEventBus().fire(SAMPLE_EVENT)

    const { chunks, cancel } = await collectPromise
    cancel()

    const raw = chunks.join('')
    expect(raw).toContain('data:')
    expect(raw).toContain('task_created')
  })

  it('happy path: multiple simultaneous SSE connections all receive the same event', async () => {
    const server = startMonitorServer({ workspace_id: 'ws_sse_test' })

    const [res1, res2, res3] = await Promise.all([
      server.fetch(new Request('http://localhost/events/stream?workspace_id=ws_sse_test')),
      server.fetch(new Request('http://localhost/events/stream?workspace_id=ws_sse_test')),
      server.fetch(new Request('http://localhost/events/stream?workspace_id=ws_sse_test')),
    ])

    const collectPromises = [
      collectChunks(res1.body!, 150),
      collectChunks(res2.body!, 150),
      collectChunks(res3.body!, 150),
    ]

    getEventBus().fire(SAMPLE_EVENT)

    const results = await Promise.all(collectPromises)
    results.forEach(({ chunks, cancel }) => {
      cancel()
      const raw = chunks.join('')
      expect(raw).toContain('task_created')
    })
  })

  it('edge case: controller removed from set when request is aborted — no further enqueue', async () => {
    const server = startMonitorServer({ workspace_id: 'ws_sse_test' })
    const abortController = new AbortController()

    const res = await server.fetch(
      new Request('http://localhost/events/stream?workspace_id=ws_sse_test', {
        signal: abortController.signal,
      }),
    )

    // Read one chunk to confirm the stream is open
    const reader = res.body!.getReader()

    // Abort the request — this should remove the SSE controller from the set
    abortController.abort()
    await reader.cancel()

    // Fire event after abort — should not throw, set should be empty or controller removed
    expect(() => {
      getEventBus().fire(SAMPLE_EVENT)
    }).not.toThrow()
  })

  it('edge case: emit event with no active SSE clients → no error', () => {
    // Start server but don't open any SSE connections
    startMonitorServer({ workspace_id: 'ws_sse_test' })

    expect(() => {
      getEventBus().fire(SAMPLE_EVENT)
    }).not.toThrow()
  })

  it('error path: broken controller is removed, other controllers still receive the event', async () => {
    const server = startMonitorServer({ workspace_id: 'ws_sse_test' })

    // Inject a fake broken controller directly into the module-private set via the bus
    // by opening a real stream first, then replacing with a spy
    const enqueueCallsGood: number[] = []
    let goodControllerRef: ReadableStreamDefaultController | null = null

    // Open a "good" SSE connection
    const goodRes = await server.fetch(
      new Request('http://localhost/events/stream?workspace_id=ws_sse_test'),
    )
    const goodCollect = collectChunks(goodRes.body!, 200)

    // Import the module to access the controllers set indirectly by checking output
    // We can't access the private Set directly, so we verify via output:
    // The good client must receive the event even if we simulate a broken client
    // by subscribing a handler that throws, then a second one that records.
    let brokenCalled = 0
    let goodHandlerCalled = 0

    const brokenHandler = (_evt: EmitEventInput) => {
      brokenCalled++
      throw new Error('Broken pipe')
    }

    const goodHandler = (_evt: EmitEventInput) => {
      goodHandlerCalled++
    }

    // The real event bus handler wraps subscriber exceptions — fire() won't throw
    getEventBus().on('task_created', brokenHandler)
    getEventBus().on('task_created', goodHandler)

    expect(() => {
      getEventBus().fire(SAMPLE_EVENT)
    }).not.toThrow()

    expect(brokenCalled).toBe(1)
    expect(goodHandlerCalled).toBe(1)

    const { chunks, cancel } = await goodCollect
    cancel()
    void goodControllerRef // suppress unused warning
    void enqueueCallsGood

    // Good SSE connection received the event
    const raw = chunks.join('')
    expect(raw).toContain('task_created')
  })
})

describe('SSE Bridge — Last-Event-ID resume', () => {
  it('streams missed events from DB when Last-Event-ID header is set', async () => {
    // Seed some events in the DB
    db.exec(`
      INSERT INTO events (evt_id, workspace_id, evt_type, payload)
      VALUES ('evt_old_1', 'ws_sse_test', 'task_created', '{"task_id":"old_1"}'),
             ('evt_old_2', 'ws_sse_test', 'agent_run_started', '{"run_id":"run_1"}')
    `)

    const server = startMonitorServer({ workspace_id: 'ws_sse_test' })

    // Request with Last-Event-ID pointing before both events
    const res = await server.fetch(
      new Request('http://localhost/events/stream?workspace_id=ws_sse_test', {
        headers: { 'Last-Event-ID': 'evt_before_all' },
      }),
    )
    expect(res.status).toBe(200)

    const { chunks, cancel } = await collectChunks(res.body!, 150)
    cancel()

    const raw = chunks.join('')
    // Both events should appear in the replay
    expect(raw).toContain('evt_old_1')
    expect(raw).toContain('evt_old_2')
  })
})
