export type TrafficDirection = "in" | "out";
export type TrafficType = "request" | "response" | "notification";
export type TrafficFilter = "all" | "requests" | "responses" | "notifications";

export interface TrafficEntry {
  id: string;
  timestamp: number;
  direction: TrafficDirection;
  type: TrafficType;
  method: string;
  requestId?: number | string;
  payload: unknown;
  error?: boolean;
  truncated?: boolean;
  droppedCount?: number;
}

export type TrafficEntryInput = Omit<TrafficEntry, "id" | "timestamp">;

export interface AcpTrafficRecorder {
  readonly entries: TrafficEntry[];
  readonly filteredEntries: TrafficEntry[];
  readonly isPaused: boolean;
  readonly filter: TrafficFilter;
  readonly searchQuery: string;
  addEntry(entry: TrafficEntryInput): void;
  clear(): void;
  togglePause(): void;
  setFilter(filter: TrafficFilter): void;
  setSearch(query: string): void;
  clearSearch(): void;
}

export interface InMemoryTrafficRecorderOptions {
  maxEntries?: number;
  now?: () => number;
  createId?: () => string;
}

const DEFAULT_MAX_ENTRIES = 500;

export function limitTrafficEntries(entries: TrafficEntry[], maxEntries = DEFAULT_MAX_ENTRIES): TrafficEntry[] {
  if (maxEntries <= 0) return [];
  if (entries.length <= maxEntries) return entries;

  const previousDroppedCount = entries.reduce((count, entry) => Math.max(count, entry.droppedCount ?? 0), 0);
  const droppedCount = previousDroppedCount + entries.length - maxEntries;
  const retained = entries.slice(-maxEntries);
  if (retained[0]) {
    retained[0] = {
      ...retained[0],
      truncated: true,
      droppedCount,
    };
  }
  return retained;
}

export function createInMemoryTrafficRecorder(options: InMemoryTrafficRecorderOptions = {}): AcpTrafficRecorder {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const now = options.now ?? Date.now;
  const createId = options.createId ?? (() => crypto.randomUUID());
  const state = {
    entries: [] as TrafficEntry[],
    isPaused: false,
    filter: "all" as TrafficFilter,
    searchQuery: "",
    droppedCount: 0,
  };

  return {
    get entries() {
      return state.entries;
    },
    get filteredEntries() {
      let result = state.entries;
      switch (state.filter) {
        case "requests":
          result = result.filter((entry) => entry.type === "request");
          break;
        case "responses":
          result = result.filter((entry) => entry.type === "response");
          break;
        case "notifications":
          result = result.filter((entry) => entry.type === "notification");
          break;
        case "all":
          break;
      }

      const query = state.searchQuery.trim().toLowerCase();
      if (!query) return result;
      return result.filter((entry) => {
        return entry.method.toLowerCase().includes(query) || JSON.stringify(entry.payload).toLowerCase().includes(query);
      });
    },
    get isPaused() {
      return state.isPaused;
    },
    get filter() {
      return state.filter;
    },
    get searchQuery() {
      return state.searchQuery;
    },
    addEntry(entry) {
      if (state.isPaused) return;
      if (maxEntries <= 0) {
        state.droppedCount += 1;
        return;
      }
      state.entries.push({
        ...entry,
        id: createId(),
        timestamp: now(),
      });
      if (state.entries.length > maxEntries) {
        state.droppedCount += state.entries.length - maxEntries;
        state.entries = state.entries.slice(-maxEntries);
        if (state.entries[0]) {
          state.entries[0] = {
            ...state.entries[0],
            truncated: true,
            droppedCount: state.droppedCount,
          };
        }
      }
    },
    clear() {
      state.entries = [];
      state.droppedCount = 0;
    },
    togglePause() {
      state.isPaused = !state.isPaused;
    },
    setFilter(filter) {
      state.filter = filter;
    },
    setSearch(query) {
      state.searchQuery = query;
    },
    clearSearch() {
      state.searchQuery = "";
    },
  };
}

export function createNoopTrafficRecorder(): AcpTrafficRecorder {
  return createInMemoryTrafficRecorder({ maxEntries: 0, createId: () => "noop" });
}
