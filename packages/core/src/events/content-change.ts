// v2a PR 4 Task 22a — content-change event contract.
//
// Both watchers (chokidar vault, fs.watch PCI) emit ContentChangeEvent on
// this bus after a 100ms debounce. v2b consumers (git reducer, REM extraction)
// subscribe to the unified stream without per-watcher branching.

export type ContentChangeKind = 'memory' | 'code' | 'l0_raw' | 'l1_curated'
export type ContentChangeType = 'add' | 'change' | 'unlink' | 'rename'

export interface ContentChangeEvent {
  kind: ContentChangeKind
  path: string
  sha256: string
  change_type: ContentChangeType
  /** ISO 8601. Set when the event is emitted (post-debounce). */
  ts: string
}

export type ContentChangeHandler = (evt: ContentChangeEvent) => void | Promise<void>

export interface ContentChangeBus {
  on(handler: ContentChangeHandler): void
  off(handler: ContentChangeHandler): void
  emit(evt: Omit<ContentChangeEvent, 'ts'>): void
  listenerCount(): number
}

const DEBOUNCE_MS = 100

class DebouncedContentChangeBus implements ContentChangeBus {
  private readonly handlers = new Set<ContentChangeHandler>()
  private readonly pending = new Map<string, { evt: Omit<ContentChangeEvent, 'ts'>; timer: NodeJS.Timeout }>()

  on(handler: ContentChangeHandler): void { this.handlers.add(handler) }
  off(handler: ContentChangeHandler): void { this.handlers.delete(handler) }
  listenerCount(): number { return this.handlers.size }

  emit(evt: Omit<ContentChangeEvent, 'ts'>): void {
    const key = `${evt.kind}:${evt.path}`
    const existing = this.pending.get(key)
    if (existing) clearTimeout(existing.timer)

    const timer = setTimeout(() => {
      this.pending.delete(key)
      const finalEvent: ContentChangeEvent = { ...evt, ts: new Date().toISOString() }
      for (const handler of this.handlers) {
        try {
          const r = handler(finalEvent)
          if (r && typeof (r as Promise<void>).catch === 'function') {
            (r as Promise<void>).catch(() => { /* fire-and-forget */ })
          }
        } catch { /* never let a handler crash the bus */ }
      }
    }, DEBOUNCE_MS)

    // Coalesce: if multiple events arrive for the same (kind, path) within the
    // debounce window, the last one wins — preserving the latest sha256 and
    // change_type. This dedups two-fast-edits-in-100ms into one downstream event.
    this.pending.set(key, { evt, timer })
  }
}

let _bus: ContentChangeBus | null = null

export function getContentChangeBus(): ContentChangeBus {
  if (!_bus) _bus = new DebouncedContentChangeBus()
  return _bus
}

export function setContentChangeBus(bus: ContentChangeBus): void {
  _bus = bus
}

export function resetContentChangeBus(): void {
  _bus = new DebouncedContentChangeBus()
}
