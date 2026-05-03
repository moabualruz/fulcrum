/**
 * P11#16 — NL→filter translation via inference sidecar.
 *
 * Gated behind `report-llm-narration` feature flag.
 * Translates natural-language queries like "docs about deployment last week"
 * into a structured filter AST `{ filters, facets, text }` matching
 * SavedViewQuery from src/filters/ast.ts.
 *
 * Sidecar timeout (5s) → plain-text pass-through fallback.
 * No separate query path — AST injected into standard search.query call.
 */

import { type SavedViewQuery, SavedViewQuerySchema } from "../filters/ast.ts";

const SIDECAR_TIMEOUT_MS = 5_000;

/**
 * Sidecar interface — abstracts the inference call.
 * Production: HTTP POST to sidecar; tests: mock.
 */
export interface NlFilterSidecar {
  translate(query: string): Promise<SavedViewQuery>;
}

/**
 * HttpNlFilterSidecar — calls inference sidecar via HTTP.
 * Expects sidecar at FULCRUM_SIDECAR_URL (default http://localhost:11435).
 */
export class HttpNlFilterSidecar implements NlFilterSidecar {
  private readonly url: string;

  constructor(url?: string) {
    this.url = (url ?? process.env["FULCRUM_SIDECAR_URL"] ?? "http://localhost:11435").replace(/\/+$/, "");
  }

  async translate(query: string): Promise<SavedViewQuery> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SIDECAR_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.url}/v1/nl-filter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, schema: "SavedViewQuery" }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Sidecar returned ${response.status}`);
      }

      const body = await response.json();
      return SavedViewQuerySchema.parse(body);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Result of NL→filter translation attempt.
 */
export interface NlFilterResult {
  /** Parsed filter AST (null if fallback to plain text). */
  ast: SavedViewQuery | null;
  /** Whether translation was used (vs plain-text fallback). */
  translated: boolean;
  /** Original query string. */
  originalQuery: string;
}

/**
 * Attempt NL→filter translation. On any error or timeout, returns
 * plain-text fallback (ast=null, translated=false).
 */
export async function translateNlToFilter(
  query: string,
  sidecar: NlFilterSidecar,
): Promise<NlFilterResult> {
  try {
    const ast = await sidecar.translate(query);
    return { ast, translated: true, originalQuery: query };
  } catch {
    // Timeout, network error, invalid response → plain-text fallback
    return { ast: null, translated: false, originalQuery: query };
  }
}

/**
 * Plain-text passthrough — wraps raw query into a SavedViewQuery
 * with text field only (no filters, no facets).
 */
export function plainTextFallback(query: string): SavedViewQuery {
  return { filters: [], text: query, facets: {} };
}
