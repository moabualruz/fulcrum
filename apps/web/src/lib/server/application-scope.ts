interface WebApplicationScopeLocals {
  em?: unknown;
  orgId?: string | null;
  userId?: string | null;
}

export function __setApplicationScopeForTest(_scope: WebApplicationScopeLocals | null): () => void {
  return () => {};
}

export async function requestAppScope(): Promise<never> {
  throw new Error("Web application scope is retired; use public API web clients.");
}
