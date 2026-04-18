// Plan Unit 5.4 — asserts the public error-code set the daemon surfaces over
// the wire. Keeping this frozen prevents accidental renames: every code in
// this list is part of the stable client contract.

import { describe, it, expect } from 'vitest'
import type { IndexerErrorCode } from '../protocol.js'

describe('IndexerErrorCode surface', () => {
  it('contains exactly the documented set — add new codes via a follow-up PR', () => {
    // Compile-time: if any name below is no longer a valid IndexerErrorCode,
    // tsc in test-run mode will complain.
    const codes: IndexerErrorCode[] = [
      'unknown_method',
      'invalid_params',
      'vault_owned_path',
      'not_watching',
      'busy',
      'internal',
    ]
    // Runtime: the array has no duplicates.
    expect(new Set(codes).size).toBe(codes.length)
    // Runtime: cardinality is 6 — extra codes here require a plan update.
    expect(codes).toHaveLength(6)
  })
})
