import { inject, injectable as Injectable } from "@needle-di/core";

import type {
  MemoryImportance,
  MemoryKind,
  MemorySource,
} from "../db/entities/memory/enums.ts";
import { MemoryRepository } from "../db/repositories/memory/MemoryRepository.ts";

export interface HeuristicMemory {
  kind: MemoryKind;
  body: string;
  source: MemorySource;
  importance: MemoryImportance;
  spanStart: number;
  spanEnd: number;
  sourceRef: {
    span_start: number;
    span_end: number;
  };
}

interface LineSpan {
  text: string;
  start: number;
  end: number;
}

interface Candidate {
  kind: MemoryKind;
  body: string;
  importance?: MemoryImportance;
  spanStart: number;
  spanEnd: number;
}

@Injectable()
export class HeuristicExtractor {
  constructor(private readonly memoryRepo = inject(MemoryRepository)) {}

  extractMemories(text: string): HeuristicMemory[] {
    if (text.trim() === "") return [];

    const rows: HeuristicMemory[] = [];
    const claimed: Array<[number, number]> = [];
    const lines = splitLines(text);

    const add = (candidate: Candidate): void => {
      const body = normalizeBody(candidate.body);
      if (body === "") return;
      if (
        claimed.some(([start, end]) =>
          spansOverlap(candidate.spanStart, candidate.spanEnd, start, end)
        )
      ) {
        return;
      }

      claimed.push([candidate.spanStart, candidate.spanEnd]);
      rows.push({
        kind: candidate.kind,
        body,
        source: "heuristic",
        importance: candidate.importance ?? "medium",
        spanStart: candidate.spanStart,
        spanEnd: candidate.spanEnd,
        sourceRef: {
          span_start: candidate.spanStart,
          span_end: candidate.spanEnd,
        },
      });
    };

    extractFileRefs(text, add);
    extractDecisions(lines, add);
    extractHeadings(lines, add);
    extractBlockers(lines, add);
    extractLinks(text, add);

    return rows;
  }
}

function splitLines(text: string): LineSpan[] {
  const lines: LineSpan[] = [];
  const pattern = /.*(?:\r?\n|$)/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    if (raw === "") continue;
    const start = match.index;
    const end = start + raw.length;
    lines.push({
      text: raw.replace(/\r?\n$/, ""),
      start,
      end,
    });
  }
  return lines;
}

function extractFileRefs(text: string, add: (candidate: Candidate) => void): void {
  const pattern = /\[?\b(read|wrote|created|deleted)\]?\s+([^\s`"'<>]+)/gi;
  for (const match of text.matchAll(pattern)) {
    const rawPath = match[2];
    if (!rawPath) continue;
    const spanStart = match.index;
    const spanEnd = spanStart + match[0].length;
    add({
      kind: "file_ref",
      body: stripTrailingPunctuation(rawPath),
      spanStart,
      spanEnd,
    });
  }
}

function extractDecisions(lines: LineSpan[], add: (candidate: Candidate) => void): void {
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) continue;
    const trimmed = line.text.trim();
    const inline = /^(?:[-*]\s*)?(?:decided|decision)\s*[:\-]\s*(.+)$/i.exec(trimmed);
    if (inline?.[1]) {
      add({
        kind: "decision",
        body: inline[1],
        importance: "high",
        spanStart: line.start,
        spanEnd: line.end,
      });
      continue;
    }

    if (/^##\s+Decision\b/i.test(trimmed)) {
      const next = nextContentLine(lines, index + 1);
      add({
        kind: "decision",
        body: next?.text ?? trimmed.replace(/^##\s+/, ""),
        importance: "high",
        spanStart: line.start,
        spanEnd: line.end,
      });
    }
  }
}

function extractHeadings(lines: LineSpan[], add: (candidate: Candidate) => void): void {
  for (const line of lines) {
    const heading = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line.text.trim());
    if (!heading?.[2]) continue;
    add({
      kind: "section_anchor",
      body: heading[2],
      spanStart: line.start,
      spanEnd: line.end,
    });
  }
}

function extractBlockers(lines: LineSpan[], add: (candidate: Candidate) => void): void {
  const pattern = /\b(?:blocked by|waiting on|need .+ to proceed)\b/i;
  for (const line of lines) {
    const trimmed = line.text.trim();
    if (!pattern.test(trimmed)) continue;
    add({
      kind: "blocker",
      body: trimmed,
      importance: "high",
      spanStart: line.start,
      spanEnd: line.end,
    });
  }
}

function extractLinks(text: string, add: (candidate: Candidate) => void): void {
  for (const match of text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    const body = match[1];
    if (!body) continue;
    const spanStart = match.index;
    add({
      kind: "link",
      body,
      spanStart,
      spanEnd: spanStart + match[0].length,
    });
  }

  for (const match of text.matchAll(/https?:\/\/[^\s<>\]\)]+/g)) {
    const url = match[0];
    const spanStart = match.index;
    add({
      kind: "link",
      body: stripTrailingPunctuation(url),
      spanStart,
      spanEnd: spanStart + url.length,
    });
  }
}

function nextContentLine(lines: LineSpan[], startIndex: number): LineSpan | undefined {
  for (let index = startIndex; index < lines.length; index++) {
    const line = lines[index];
    if (line && line.text.trim() !== "") return line;
  }
  return undefined;
}

function normalizeBody(body: string): string {
  return stripTrailingPunctuation(body.trim());
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:]+$/g, "");
}

function spansOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}
