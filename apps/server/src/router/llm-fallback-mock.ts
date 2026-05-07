/**
 * llm-fallback-mock.ts — Mock LLM fallback provider for promptfoo eval
 * (router-llm-eval.promptfooconfig.yaml).
 *
 * Returns structured routing responses that exercise the eval cases.
 * This is a test fixture, not production code.
 *
 * Promptfoo loads this via `file:///absolute/path/to/mock`.
 * The default export must be a class or object with `id()` and `callApi()`.
 */

export default class LlmFallbackMockProvider {
  id(): string {
    return "mock-llm-fallback";
  }

  async callApi(prompt: string): Promise<{ output: string }> {
    // Locate the Instruction: section and use its content to determine
    // which test case we are serving.  The instruction text is unique
    // per case and avoids false matches against the status enum in the
    // system prompt prefix.
    const instructionMatch = prompt.match(/Instruction:\s*(.+?)(?:\n|$)/);
    const instruction = instructionMatch?.[1] ?? "";

    let status: string;
    let confidence: number;
    let evidence: string[];
    let agent: string | null;

    if (/always return status=matched/.test(instruction)) {
      status = "matched";
      confidence = 1.0;
      evidence = [
        'mock: instruction requested "matched"',
        "mock: processed via mock provider",
      ];
      agent = "codex";
    } else if (/status=abstained/.test(instruction)) {
      status = "abstained";
      confidence = 0.42;
      evidence = [
        'mock: instruction requested "abstained"',
        "mock: processed via mock provider",
      ];
      agent = null;
    } else if (/status=conflict/.test(instruction)) {
      status = "conflict";
      confidence = 0.75;
      evidence = [
        'mock: instruction requested "conflict"',
        "mock: overlaps with rule-01, rule-03",
      ];
      agent = null;
    } else {
      // Default: status=review_needed
      status = "review_needed";
      confidence = 0.75;
      evidence = [
        "mock: instruction requested review_needed",
        "mock: processed via mock provider",
      ];
      agent = null;
    }

    return {
      output: JSON.stringify({
        status,
        confidence,
        backend: null,
        evidence,
        agent,
        routeId: null,
      }),
    };
  }
}
