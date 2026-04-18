// Zero-dependency error types shared by the indexer daemon's handlers and
// registry. Extracted so `registry.ts` can import HandlerError without
// pulling in handlers.ts (which in turn imports from registry.ts — cycle).
//
// See docs/plans/2026-04-18-001-refactor-indexer-daemon-plan.md.

import type { IndexerErrorCode } from './protocol.js'

/** Thrown by daemon handlers to map a typed error onto the wire `{error:{code,message}}` envelope. */
export class HandlerError extends Error {
  constructor(
    public readonly code: IndexerErrorCode,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'HandlerError'
  }
}
