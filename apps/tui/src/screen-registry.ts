/**
 * Screen registry for the TUI — the canonical TUI screen catalog.
 *
 * Two responsibilities:
 *  1. A lightweight in-memory registry mapping screen-key → metadata, used by
 *     the launcher and router so every navigable surface is named, titled, and
 *     uniquely registered.
 *  2. The single source of truth for the OD `tui-runs.html` root chrome: the
 *     six-stage StageNav (Capture / Plan / Build / Review / Ship / Operate) and
 *     the always-visible top tab strip (`#tui-tabs`), plus the ColonPalette
 *     route map that resolves `:capture`, `:plan`, `:runs`, `:board`, `:review`,
 *     `:ship`, `:doctor`, `:ai` (and the system screens) to a screen key.
 *
 * The root launcher and `TuiRouter` consume this so the snapshot test can lock
 * concrete OD labels and order, not placeholder text.
 */

export interface ScreenDescriptor {
  /** Stable screen key — used for telemetry, history stack, route lookup. */
  key: string;
  /** Human title — appears in status bar / breadcrumb. */
  title: string;
  /** Optional pillar attribution (e.g. "P3", "P4"). */
  pillar?: string;
}

export class ScreenRegistry {
  private readonly screens = new Map<string, ScreenDescriptor>();
  private readonly order: string[] = [];

  register(descriptor: ScreenDescriptor): void {
    if (this.screens.has(descriptor.key)) {
      throw new Error(`Screen "${descriptor.key}" already registered.`);
    }
    this.screens.set(descriptor.key, descriptor);
    this.order.push(descriptor.key);
  }

  get(key: string): ScreenDescriptor | undefined {
    return this.screens.get(key);
  }

  has(key: string): boolean {
    return this.screens.has(key);
  }

  list(): readonly ScreenDescriptor[] {
    return this.order.map((k) => this.screens.get(k)!).filter(Boolean);
  }

  size(): number {
    return this.screens.size;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage navigation — the six workflow stages (CLI-TUI-UX.md §6, IA-MAP.md §9)
// ─────────────────────────────────────────────────────────────────────────────

/** One workflow-stage entry rendered in the root StageNav. */
export interface StageNavEntry {
  /** Exact stage label — locked by the snapshot test. */
  label: "Capture" | "Plan" | "Build" | "Review" | "Ship" | "Operate";
  /** Default screen key opened when the stage is selected. */
  screenKey: string;
  /** Default colon route for the stage (CLI-TUI-UX.md §6 screen ids). */
  colon: string;
  /** StageChord key suffix (`g <key>`) per CLI-TUI-UX.md §7.2. */
  chord: string;
}

/**
 * The six workflow stages, in the canonical Capture → Operate order shared with
 * the web shell StageRail and the CLI stage command tree. Labels are exact.
 */
export const TUI_STAGE_NAV: readonly StageNavEntry[] = [
  { label: "Capture", screenKey: "capture", colon: ":capture", chord: "c" },
  { label: "Plan", screenKey: "plan", colon: ":plan", chord: "p" },
  { label: "Build", screenKey: "runs", colon: ":runs", chord: "b" },
  { label: "Review", screenKey: "review", colon: ":review", chord: "r" },
  { label: "Ship", screenKey: "ship", colon: ":ship", chord: "s" },
  { label: "Operate", screenKey: "doctor", colon: ":doctor", chord: "o" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Top tab strip — OD `tui-runs.html` #tui-tabs (always-visible root chrome)
// ─────────────────────────────────────────────────────────────────────────────

/** One button in the OD top tab strip. */
export interface TabStripEntry {
  /** Visible tab label — exact, matches OD `#tui-tabs button` text. */
  label: string;
  /** Screen key the tab routes to. */
  screenKey: string;
}

/**
 * The OD `tui-runs.html` `#tui-tabs` strip — sixteen buttons in exact order.
 * This is always-visible root chrome; the snapshot test locks order + labels.
 *
 * OD source order: :capture :plan :runs :board :review :ship :doctor :run :ai
 * :agents :mcp :plugins :routes :settings :K ?
 */
export const TUI_TAB_STRIP: readonly TabStripEntry[] = [
  { label: ":capture", screenKey: "capture" },
  { label: ":plan", screenKey: "plan" },
  { label: ":runs", screenKey: "runs" },
  { label: ":board", screenKey: "build-board" },
  { label: ":review", screenKey: "review" },
  { label: ":ship", screenKey: "ship" },
  { label: ":doctor", screenKey: "doctor" },
  { label: ":run", screenKey: "run" },
  { label: ":ai", screenKey: "ai" },
  { label: ":agents", screenKey: "agents" },
  { label: ":mcp", screenKey: "mcp" },
  { label: ":plugins", screenKey: "plugins" },
  { label: ":routes", screenKey: "routes" },
  { label: ":settings", screenKey: "settings" },
  { label: ":K", screenKey: "palette" },
  { label: "?", screenKey: "help" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Colon-route resolution (ColonPalette / `:` command grammar)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Colon route → canonical screen key. Covers every stage route, the system
 * screens, and the CLI-TUI-UX.md §6 aliases (`:inbox`→`:capture`,
 * `:plans`→`:plan`, `:tasks`/`:list`→`:board`/`:tasks`, `:artifacts`→`:ship`).
 *
 * The `prd-tui-stage-chords-and-colon-palette` PRD owns the `g`-chord state
 * machine and the `:` command grammar parsing; this map is the screen-resolution
 * layer both that PRD and the root launcher consume.
 */
export const TUI_COLON_ROUTES: Readonly<Record<string, string>> = {
  ":capture": "capture",
  ":inbox": "capture",
  ":plan": "plan",
  ":plans": "plan",
  ":runs": "runs",
  ":run": "run",
  ":board": "build-board",
  ":tasks": "tasks",
  ":list": "tasks",
  ":review": "review",
  ":ship": "ship",
  ":artifacts": "ship",
  ":doctor": "doctor",
  ":ai": "ai",
  ":agents": "agents",
  ":mcp": "mcp",
  ":plugins": "plugins",
  ":routes": "routes",
  ":settings": "settings",
  ":K": "palette",
  "?": "help",
};

/**
 * Resolve a colon route (`:capture`, `:plan`, …) to its screen key. Accepts the
 * leading `:` optionally and keeps the `:K` palette and `?` help routes
 * addressable. Returns `undefined` for an unknown route so the caller can render
 * a not-found screen instead of crashing.
 */
export function resolveColonRoute(route: string): string | undefined {
  const trimmed = route.trim();
  if (TUI_COLON_ROUTES[trimmed]) return TUI_COLON_ROUTES[trimmed];
  const withColon = trimmed.startsWith(":") || trimmed === "?" ? trimmed : `:${trimmed}`;
  return TUI_COLON_ROUTES[withColon];
}

/**
 * Build the canonical TUI screen registry — every stage screen, every tab-strip
 * screen, and the system screens, each registered exactly once. The launcher
 * and router consume this so a screen is never navigable without metadata.
 */
export function buildTuiScreenRegistry(): ScreenRegistry {
  const registry = new ScreenRegistry();
  const titles: Record<string, string> = {
    capture: "Capture",
    plan: "Plan",
    runs: "Build · Runs",
    "build-board": "Build · Board",
    tasks: "Build · Tasks",
    run: "Run detail",
    review: "Review",
    ship: "Ship",
    doctor: "Operate · Doctor",
    ai: "AI Assist",
    agents: "Agents",
    mcp: "MCP",
    plugins: "Plugins",
    routes: "Routes",
    settings: "Settings",
    palette: "Command palette",
    help: "Keyboard help",
  };
  const seen = new Set<string>();
  const order: string[] = [
    ...TUI_STAGE_NAV.map((s) => s.screenKey),
    ...TUI_TAB_STRIP.map((t) => t.screenKey),
  ];
  for (const key of order) {
    if (seen.has(key)) continue;
    seen.add(key);
    registry.register({ key, title: titles[key] ?? key });
  }
  return registry;
}
