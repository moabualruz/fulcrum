import type { CanonicalSource, EmitResult } from '../types.js'

// PI (pi-coding-agent / cockpit) consumes the canonical skills directory natively
// via the symlink at agent-integration/pi/cockpit/skills -> ../../skills (shipped
// 2026-04-17 per memory-v2a plan §602-604). PR 1 unit 1.4 is a deliberate no-op
// per Open Question #5 (v2 resolution): PI reads the canonical path directly;
// fan-out emits nothing.
export function emitPi(_source: CanonicalSource): EmitResult {
  return { target: 'pi', artifacts: [] }
}
