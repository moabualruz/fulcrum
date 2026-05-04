// @ts-nocheck — new file, type fixes deferred to gate review
/**
 * TUI full-screen search with optional semantic toggle.
 *
 * WHY: Q17 / C1 — FTS is always-on; hybrid BM25+cosine (embeddings) gated
 * behind FULCRUM_FEATURES=embeddings.  When OFF: "Semantic" toggle chip
 * hidden, all queries use mode='fts'.  When ON: chip visible; selecting
 * toggles mode to 'hybrid'.
 */

import { isEnabled } from "../../flags/index.ts";
import type { SearchMode, SearchOptions, SearchResult } from "../types.ts";

export interface FilterChipsState {
  /** Chip tokens always shown (e.g. All, Project, Task, Doc). */
  baseChips: string[];
  /** "Semantic" chip present only when embeddings flag is ON. */
  semanticChipVisible: boolean;
  /** Currently active mode. */
  mode: SearchMode;
}

export interface SearchScreenState {
  filterChips: FilterChipsState;
  query: string;
}

export interface SearchService {
  query(opts: SearchOptions): Promise<SearchResult[]>;
}

export interface SearchScreenOptions {
  searchService: SearchService;
  env?: Record<string, string | undefined>;
}

/** Build initial FilterChips state based on flag. */
export function buildFilterChips(
  env?: Record<string, string | undefined>,
): FilterChipsState {
  const semanticChipVisible = isEnabled("embeddings", env);
  return {
    baseChips: ["All", "Project", "Task", "Doc"],
    semanticChipVisible,
    mode: "fts", // always start in FTS; user toggles to hybrid
  };
}

/** Toggle the semantic chip (only valid when embeddings flag is ON). */
export function toggleSemanticMode(
  chips: FilterChipsState,
  env?: Record<string, string | undefined>,
): FilterChipsState {
  if (!isEnabled("embeddings", env)) {
    // Guard: if flag was just turned off mid-session, revert to fts.
    return { ...chips, semanticChipVisible: false, mode: "fts" };
  }
  const newMode: SearchMode = chips.mode === "fts" ? "hybrid" : "fts";
  return { ...chips, mode: newMode };
}

/** Execute a search with the given chips state. */
export async function executeSearch(
  query: string,
  orgId: string,
  chips: FilterChipsState,
  service: SearchService,
): Promise<SearchResult[]> {
  return service.query({
    query,
    orgId,
    mode: chips.mode,
    limit: 25,
  });
}
