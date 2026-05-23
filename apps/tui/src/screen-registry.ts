/**
 * Screen registry for the TUI: the canonical TUI screen catalog.
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
  /** Stable screen key: used for telemetry, history stack, route lookup. */
  key: string;
  /** Human title: appears in status bar / breadcrumb. */
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
// Stage navigation: the six workflow stages (CLI-TUI-UX.md §6, IA-MAP.md §9)
// ─────────────────────────────────────────────────────────────────────────────

/** One workflow-stage entry rendered in the root StageNav. */
export interface StageNavEntry {
  /** Exact stage label: locked by the snapshot test. */
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
// Top tab strip: OD `tui-runs.html` #tui-tabs (always-visible root chrome)
// ─────────────────────────────────────────────────────────────────────────────

/** One button in the OD top tab strip. */
export interface TabStripEntry {
  /** Visible tab label: exact, matches OD `#tui-tabs button` text. */
  label: string;
  /** Screen key the tab routes to. */
  screenKey: string;
}

/**
 * The OD `tui-runs.html` `#tui-tabs` strip: sixteen buttons in exact order.
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

export interface CanonicalTuiRoute {
  route: string;
  screenKey: string;
  target: string;
  title: string;
}

/**
 * Canonical static TUI screen list from CLI-TUI-UX.md §6. `screenKey` is the
 * registry identity; `target` is the concrete `TuiApp` screen implementation.
 * `TUI_COLON_ROUTES` and `resolveTuiColonScreen` both derive from this list.
 */
export const CANONICAL_TUI_ROUTES: readonly CanonicalTuiRoute[] = [
  { route: ":capture", screenKey: "capture", target: "capture", title: "Capture" },
  { route: ":inbox", screenKey: "capture", target: "capture", title: "Capture" },
  { route: ":docs", screenKey: "docs", target: "docs", title: "Capture · Docs" },
  { route: ":doc", screenKey: "doc", target: "docs", title: "Capture · Document" },
  { route: ":notes", screenKey: "notes", target: "notes", title: "Capture · Notes" },
  { route: ":plan", screenKey: "plan", target: "plan", title: "Plan" },
  { route: ":plans", screenKey: "plan", target: "plan", title: "Plan" },
  { route: ":missions", screenKey: "missions", target: "planning", title: "Plan · Missions" },
  { route: ":prototype", screenKey: "prototype", target: "planning", title: "Plan · Prototype" },
  { route: ":templates", screenKey: "templates", target: "planning", title: "Plan · Templates" },
  { route: ":prompts", screenKey: "prompts", target: "planning", title: "Plan · Prompts" },
  { route: ":runs", screenKey: "runs", target: "runs", title: "Build · Runs" },
  { route: ":run", screenKey: "run", target: "run", title: "Run detail" },
  { route: ":board", screenKey: "build-board", target: "build-board", title: "Build · Board" },
  { route: ":tasks", screenKey: "tasks", target: "tasks", title: "Build · Tasks" },
  { route: ":list", screenKey: "tasks", target: "tasks", title: "Build · Tasks" },
  { route: ":timeline", screenKey: "timeline", target: "timeline", title: "Build · Timeline" },
  { route: ":table", screenKey: "table", target: "table", title: "Build · Table" },
  { route: ":graph", screenKey: "graph", target: "graph", title: "Build · Graph" },
  { route: ":cycles", screenKey: "cycles", target: "cycles", title: "Build · Cycles" },
  { route: ":modules", screenKey: "modules", target: "modules", title: "Build · Modules" },
  { route: ":review", screenKey: "review", target: "review", title: "Review" },
  { route: ":ship", screenKey: "ship", target: "artifacts", title: "Ship" },
  { route: ":artifacts", screenKey: "ship", target: "artifacts", title: "Ship" },
  { route: ":archive", screenKey: "archive", target: "artifacts", title: "Ship · Archive" },
  { route: ":repos", screenKey: "repos", target: "repos", title: "Ship · Repos" },
  { route: ":memory", screenKey: "memory", target: "memory", title: "Ship · Memory" },
  { route: ":doctor", screenKey: "doctor", target: "doctor", title: "Operate · Doctor" },
  { route: ":telemetry", screenKey: "telemetry", target: "telemetry", title: "Operate · Telemetry" },
  { route: ":alerts", screenKey: "alerts", target: "alerts", title: "Operate · Alerts" },
  { route: ":audit", screenKey: "audit", target: "audit", title: "Operate · Audit" },
  { route: ":logs", screenKey: "logs", target: "logs", title: "Operate · Logs" },
  { route: ":errors", screenKey: "errors", target: "errors", title: "Operate · Errors" },
  { route: ":mcp", screenKey: "mcp", target: "mcp", title: "Operate · MCP" },
  { route: ":plugins", screenKey: "plugins", target: "plugins", title: "Operate · Plugins" },
  { route: ":hooks", screenKey: "hooks", target: "hooks", title: "Operate · Hooks" },
  { route: ":skills", screenKey: "skills", target: "skills", title: "Operate · Skills" },
  { route: ":trace", screenKey: "trace", target: "trace", title: "Operate · Trace" },
  { route: ":ai", screenKey: "ai", target: "ai-assist", title: "AI Assist" },
  { route: ":agents", screenKey: "agents", target: "agents", title: "Agents" },
  { route: ":routes", screenKey: "routes", target: "routing-rules", title: "Routes" },
  { route: ":settings", screenKey: "settings", target: "settings", title: "Settings" },
  { route: ":K", screenKey: "palette", target: "nav", title: "Command palette" },
  { route: "?", screenKey: "help", target: "nav", title: "Keyboard help" },
] as const;

export const TUI_COLON_ROUTES: Readonly<Record<string, string>> = Object.fromEntries(
  CANONICAL_TUI_ROUTES.map((entry) => [entry.route, entry.screenKey]),
);

export const TUI_COLON_SCREEN_TARGETS: Readonly<Record<string, string>> = Object.fromEntries(
  CANONICAL_TUI_ROUTES.map((entry) => [entry.screenKey, entry.target]),
);

const DYNAMIC_TUI_ROUTES: ReadonlyArray<{ pattern: RegExp; screenKey: string }> = [
  { pattern: /^:?doc\/[^/]+$/, screenKey: "doc" },
  { pattern: /^:?plan\/[^/]+(?:\/review)?$/, screenKey: "plan" },
  { pattern: /^:?mission\/[^/]+$/, screenKey: "missions" },
  { pattern: /^:?run\/[^/]+$/, screenKey: "run" },
  { pattern: /^:?cycle\/[^/]+$/, screenKey: "cycles" },
  { pattern: /^:?module\/[^/]+$/, screenKey: "modules" },
  { pattern: /^:?review\/[^/]+$/, screenKey: "review" },
  { pattern: /^:?qa\/[^/]+$/, screenKey: "review" },
  { pattern: /^:?ship\/[^/]+$/, screenKey: "ship" },
  { pattern: /^:?artifact\/[^/]+$/, screenKey: "ship" },
  { pattern: /^:?repo\/[^/]+$/, screenKey: "repos" },
  { pattern: /^:?trace\/[^/]+$/, screenKey: "trace" },
];

/**
 * Resolve a colon route (`:capture`, `:plan`, …) to its screen key. Accepts the
 * leading `:` optionally and keeps the `:K` palette and `?` help routes
 * addressable. Returns `undefined` for an unknown route so the caller can render
 * a not-found screen instead of crashing.
 */
export function resolveColonRoute(route: string): string | undefined {
  const trimmed = route.trim();
  for (const dynamic of DYNAMIC_TUI_ROUTES) {
    if (dynamic.pattern.test(trimmed)) return dynamic.screenKey;
  }
  if (TUI_COLON_ROUTES[trimmed]) return TUI_COLON_ROUTES[trimmed];
  const withColon = trimmed.startsWith(":") || trimmed === "?" ? trimmed : `:${trimmed}`;
  return TUI_COLON_ROUTES[withColon];
}

export function resolveCanonicalTuiRoute(route: string): CanonicalTuiRoute | undefined {
  const screenKey = resolveColonRoute(route);
  if (!screenKey) return undefined;
  return CANONICAL_TUI_ROUTES.find((entry) => entry.screenKey === screenKey);
}

/**
 * Build the canonical TUI screen registry: every stage screen, every tab-strip
 * screen, and the system screens, each registered exactly once. The launcher
 * and router consume this so a screen is never navigable without metadata.
 */
export function buildTuiScreenRegistry(): ScreenRegistry {
  const registry = new ScreenRegistry();
  const titles: Record<string, string> = Object.fromEntries(
    CANONICAL_TUI_ROUTES.map((entry) => [entry.screenKey, entry.title]),
  );
  const seen = new Set<string>();
  const order: string[] = [
    ...TUI_STAGE_NAV.map((s) => s.screenKey),
    ...TUI_TAB_STRIP.map((t) => t.screenKey),
    ...Object.values(TUI_COLON_ROUTES),
  ];
  for (const key of order) {
    if (seen.has(key)) continue;
    seen.add(key);
    registry.register({ key, title: titles[key] ?? key });
  }
  return registry;
}
