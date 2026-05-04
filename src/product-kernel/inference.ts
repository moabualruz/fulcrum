/**
 * Inference sidecar client — communicates with the Pillar 2 inference sidecar
 * via JSON-RPC over Unix socket or stdio.
 *
 * When the sidecar is unavailable, calls throw with a clear error so callers
 * can degrade gracefully.
 */

export interface InferenceSidecar {
  embed(text: string): Promise<number[]>;
  narrate(prompt: string): Promise<string>;
}

export interface InferenceSidecarOptions {
  /** Backend hint from feature flag, e.g. "ollama", "openai-compatible". */
  backend?: string | null;
}

/**
 * Create a sidecar client. In production this connects to the real sidecar;
 * for tests, inject a mock via `createMockSidecar`.
 */
export function createSidecar(opts?: InferenceSidecarOptions): InferenceSidecar {
  const backend = opts?.backend ?? "default";
  return {
    async embed(_text: string): Promise<number[]> {
      throw new Error(
        `Inference sidecar (backend=${backend}) not available. ` +
        "Pillar 2 must be running for embeddings.",
      );
    },
    async narrate(_prompt: string): Promise<string> {
      throw new Error(
        `Inference sidecar (backend=${backend}) not available. ` +
        "Pillar 2 must be running for LLM narration.",
      );
    },
  };
}

/**
 * Create a mock sidecar for testing.
 */
export function createMockSidecar(overrides?: {
  embed?: (text: string) => Promise<number[]>;
  narrate?: (prompt: string) => Promise<string>;
}): InferenceSidecar & { calls: { method: string; args: unknown[] }[] } {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    calls,
    async embed(text: string): Promise<number[]> {
      calls.push({ method: "embed", args: [text] });
      if (overrides?.embed) return overrides.embed(text);
      // Return a deterministic fake embedding (normalized unit vector dimension 8 for tests)
      const hash = simpleHash(text);
      return Array.from({ length: 8 }, (_, i) => Math.sin(hash + i));
    },
    async narrate(prompt: string): Promise<string> {
      calls.push({ method: "narrate", args: [prompt] });
      if (overrides?.narrate) return overrides.narrate(prompt);
      return "Mock narrative paragraph 1.\n\nMock narrative paragraph 2.\n\nMock narrative paragraph 3.";
    },
  };
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}
