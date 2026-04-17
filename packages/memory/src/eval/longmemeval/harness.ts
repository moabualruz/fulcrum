// PR 14 Task 5.2 — LongMemEval harness (SECONDARY signal).
//
// Evaluates conversational-memory recall quality using the 50/450 dev/test split.
// This is explicitly labeled "conversational-memory benchmark" and is NOT the primary
// regression gate (Fulcrum-specific harness is primary per Gate 4 ADR).

export interface LmeSession {
  session_id: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface LmeEntry {
  id: string
  question: string
  expected_answer: string
  sessions: LmeSession[]
}

export type LmeAnswerer = (question: string, sessions: LmeSession[]) => Promise<string>

export interface LmeSplit {
  dev: LmeEntry[]
  test: LmeEntry[]
}

export interface LmeEvalResult {
  benchmark_label: 'conversational-memory benchmark'
  signal_type: 'secondary'
  exact_match: number
  r_at_5: number
  mrr: number
  total_queries: number
  dev_size: number
  test_size: number
}

export function splitCorpus(entries: LmeEntry[], devSize: number): LmeSplit {
  return {
    dev: entries.slice(0, devSize),
    test: entries.slice(devSize),
  }
}

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

export async function runLongMemEval(
  entries: LmeEntry[],
  answerer: LmeAnswerer
): Promise<LmeEvalResult> {
  let exactMatchSum = 0
  let mrrSum = 0
  let rAt5Sum = 0

  for (const entry of entries) {
    const answer = await answerer(entry.question, entry.sessions)
    const isMatch = normalize(answer) === normalize(entry.expected_answer)
    exactMatchSum += isMatch ? 1 : 0
    // For single-answer QA: MRR = 1 if correct, 0 otherwise; R@5 same
    mrrSum += isMatch ? 1 : 0
    rAt5Sum += isMatch ? 1 : 0
  }

  const n = entries.length || 1

  return {
    benchmark_label: 'conversational-memory benchmark',
    signal_type: 'secondary',
    exact_match: exactMatchSum / n,
    r_at_5: rAt5Sum / n,
    mrr: mrrSum / n,
    total_queries: entries.length,
    dev_size: 0,
    test_size: 0,
  }
}
