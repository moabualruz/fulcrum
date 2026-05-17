/**
 * LLM fallback for routing (RTR-03, D-13, D-14, D-15, D-16).
 *
 * Safety guarantees:
 * - Never activates or creates active rules (D-13)
 * - Retries 3 times on structured output parse failure
 * - Uses 0.75 confidence threshold for acceptance, 0.55 abstain threshold
 * - Returns null on low confidence / parse failure → caller creates disabled draft
 *
 * Input mode support: full_context (default), task_facts, task_plus_history (D-15)
 */

import { z } from "zod";
import type { TaskFacts, RoutingDecision } from "./types.ts";

// --- Sidecar client interface (mockable) ---

export interface SidecarClient {
  healthCheck(): Promise<boolean>;
  classify(prompt: string): Promise<unknown>;
}

export interface LlmFallbackConfig {
  sidecarClient: SidecarClient | null;
}

let sidecarClient: SidecarClient | null = null;

export function configureLlmFallback(config: LlmFallbackConfig): void {
  sidecarClient = config.sidecarClient;
}

// --- Constants ---

/** Confidence threshold for accepting LLM recommendations (AI-SPEC §4). */
export const CONFIDENCE_THRESHOLD = 0.75;

/** Low-confidence abstain threshold (D-14). */
export const ABSTAIN_THRESHOLD = 0.55;

/** Max retries on structured output parse failure (D-13). */
const MAX_RETRIES = 3;

// --- Backend spec parsing ---

export interface BackendSpec {
  backend: string;
  url?: string;
  key?: string;
}

/** Parse `router-llm[:<backend>[:<url>:<key>]]` from FULCRUM_FEATURES. */
export function parseBackendSpec(): BackendSpec | null {
  const features = (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((f) => f.trim());
  const llmFeature = features.find((f) => f.startsWith("router-llm"));
  if (!llmFeature) return null;

  // Split only first two colons for non-openai-compatible backends
  // Format: router-llm[:backend[:url:key]]
  // For openai-compatible: router-llm:openai-compatible:<url>:<key>
  // URL may contain colons (http://...), so we match from the end for the key
  const afterPrefix = llmFeature.slice("router-llm".length);
  if (!afterPrefix) return { backend: "embedded", url: undefined, key: undefined };

  // afterPrefix starts with ":"
  const rest = afterPrefix.slice(1); // drop leading ":"
  if (!rest) return { backend: "embedded", url: undefined, key: undefined };

  // Check for openai-compatible
  if (rest.startsWith("openai-compatible:")) {
    const inner = rest.slice("openai-compatible:".length);
    // key is after last ":"
    const lastColon = inner.lastIndexOf(":");
    if (lastColon === -1) return { backend: "openai-compatible", url: inner, key: undefined };
    const url = inner.slice(0, lastColon);
    const key = inner.slice(lastColon + 1);
    return { backend: "openai-compatible", url, key };
  }

  // Simple backend name (embedded, ollama, lm-studio)
  return { backend: rest, url: undefined, key: undefined };
}

// --- Structured output schema ---

const ClassifierResponseSchema = z.object({
  agent: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

// --- Classifier prompt ---

function buildClassifierPrompt(facts: TaskFacts, inputMode?: string): string {
  const modeLabel = inputMode ?? "full_context";
  return [
    `Given this task (mode: ${modeLabel}), which agent should handle it?`,
    `Task: ${JSON.stringify(facts)}`,
    'Respond with JSON: {"agent": "<name>", "confidence": 0.0-1.0, "reasoning": "<why>"}.',
  ].join(" ");
}

// --- Main export ---

/**
 * Tier 3 LLM fallback. Only called when FULCRUM_FEATURES=router-llm is ON
 * and deterministic rules returned null.
 *
 * Safety (D-13, D-14):
 * - Returns a RoutingDecision with source='llm-fallback' or null on failure
 * - Never creates or activates routing rules directly
 * - Retries up to MAX_RETRIES (3) on parse failures
 * - Returns null (abstain) for confidence < ABSTAIN_THRESHOLD
 */
export async function llmFallback(
  facts: TaskFacts,
  _orgId: string,
  inputMode?: string,
): Promise<RoutingDecision | null> {
  // Gate: flag must be on
  const spec = parseBackendSpec();
  if (!spec) return null;

  if (!sidecarClient) return null;

  try {
    // Health check — graceful fallback if sidecar unreachable
    const healthy = await sidecarClient.healthCheck();
    if (!healthy) {
      console.warn("llm-fallback: sidecar health check failed; falling back to prompt path");
      return null;
    }

    const prompt = buildClassifierPrompt(facts, inputMode);

    // Retry loop for structured output parsing (D-13)
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const raw = await sidecarClient.classify(prompt);

        // Validate structured output
        const parsed = ClassifierResponseSchema.safeParse(raw);
        if (!parsed.success) {
          lastError = parsed.error;
          console.warn(
            `llm-fallback: parse attempt ${attempt}/${MAX_RETRIES} failed: ${parsed.error.message}`,
          );
          continue;
        }

        // Check confidence threshold (D-14)
        if (parsed.data.confidence < ABSTAIN_THRESHOLD) {
          console.warn(
            `llm-fallback: confidence ${parsed.data.confidence} below abstain threshold ${ABSTAIN_THRESHOLD}`,
          );
          return null;
        }

        return {
          ruleId: null,
          source: "llm-fallback",
          agent: parsed.data.agent,
          confidence: parsed.data.confidence,
        };
      } catch (error) {
        lastError = error;
        console.warn(
          `llm-fallback: attempt ${attempt}/${MAX_RETRIES} threw: ${(error as Error).message}`,
        );
      }
    }

    // All retries exhausted
    console.warn(`llm-fallback: all ${MAX_RETRIES} attempts failed: ${String(lastError)}`);
    return null;
  } catch {
    // Sidecar timeout/error — graceful fallback
    return null;
  }
}
