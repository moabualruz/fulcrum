/**
 * E2E-only search fixture path.
 *
 * Web is now a pure invocation layer, so the old in-process fixture database
 * fallback is retired. E2E suites seed through public APIs.
 */
export interface E2eSearchHit {
  id: string;
  source_kind: string;
  source_id: string;
  title: string;
  body: string;
  score: number;
  updated_at: string;
}

export async function queryE2eFixtureSearch(input: { q: string; kinds: string[] }): Promise<E2eSearchHit[]> {
  void input;
  return [];
}
