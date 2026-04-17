// License: MIT (Copyright (c) 2025 Peter Steinberger)
//
// v2a PR 1 Task 7 — JSONL append-only event log for Dreaming-relevant events.
// PR 5 (sanitize + WAL) wires this on the write path. The plan note from §5.6
// applies: sanitize() runs before WAL; events here record post-sanitize body
// hashes only.
//
// Replaces the an external enum import with a local union
// matching v2b PR 11's three-phase Dreaming model (light, REM, deep).

import fs from 'node:fs/promises'
import path from 'node:path'

export type MemoryDreamingPhaseName = 'light' | 'rem' | 'deep'

export const MEMORY_HOST_EVENT_LOG_RELATIVE_PATH = path.join('memory', '.dreams', 'events.jsonl')

export type MemoryHostRecallRecordedEvent = {
  type: 'memory.recall.recorded'
  timestamp: string
  query: string
  resultCount: number
  results: Array<{
    path: string
    startLine: number
    endLine: number
    score: number
  }>
}

export type MemoryHostPromotionAppliedEvent = {
  type: 'memory.promotion.applied'
  timestamp: string
  memoryPath: string
  applied: number
  candidates: Array<{
    key: string
    path: string
    startLine: number
    endLine: number
    score: number
    recallCount: number
  }>
}

export type MemoryHostDreamCompletedEvent = {
  type: 'memory.dream.completed'
  timestamp: string
  phase: MemoryDreamingPhaseName
  inlinePath?: string
  reportPath?: string
  lineCount: number
  storageMode: 'inline' | 'separate' | 'both'
}

export type MemoryHostEvent =
  | MemoryHostRecallRecordedEvent
  | MemoryHostPromotionAppliedEvent
  | MemoryHostDreamCompletedEvent

export function resolveMemoryHostEventLogPath(workspaceDir: string): string {
  return path.join(workspaceDir, MEMORY_HOST_EVENT_LOG_RELATIVE_PATH)
}

export async function appendMemoryHostEvent(workspaceDir: string, event: MemoryHostEvent): Promise<void> {
  const eventLogPath = resolveMemoryHostEventLogPath(workspaceDir)
  await fs.mkdir(path.dirname(eventLogPath), { recursive: true })
  await fs.appendFile(eventLogPath, `${JSON.stringify(event)}\n`, 'utf8')
}

export async function readMemoryHostEvents(params: {
  workspaceDir: string
  limit?: number
}): Promise<MemoryHostEvent[]> {
  const eventLogPath = resolveMemoryHostEventLogPath(params.workspaceDir)
  const raw = await fs.readFile(eventLogPath, 'utf8').catch((err: unknown) => {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return ''
    throw err
  })
  if (!raw.trim()) return []
  const events = raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      try { return [JSON.parse(line) as MemoryHostEvent] } catch { return [] }
    })
  if (!Number.isFinite(params.limit)) return events
  const limit = Math.max(0, Math.floor(params.limit as number))
  return limit === 0 ? [] : events.slice(-limit)
}
