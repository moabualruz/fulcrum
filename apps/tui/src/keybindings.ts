import {
  resolveKeybindings,
  type KeybindingPlatform,
  type TenantSettingsReader,
} from "@platform-core/interface/input-bindings.ts";

export async function createTuiKeybindingMap(options: {
  platform?: KeybindingPlatform;
  settings?: TenantSettingsReader;
} = {}) {
  return resolveKeybindings(options);
}

// ─── Trace clipboard yanks (CLI-TUI-UX.md §7.6) ─────────────────────────────
//
// The `y` family of clipboard chords copies the cross-surface identity rendered
// in the StatusFooter to the terminal clipboard so a run is followable across
// web / CLI / TUI:
//
//   y t → trace id   y r → run id   y s → span id   y p → project path
//
// `apps/tui/src/widgets/StatusBar.ts` (`StatusBarWidget`) already exposes the
// exact trace/run/span identity it renders via `copyKeybinds()`; this module
// owns the actual `y _` key handler so the footer PRD's "copy-keybind
// addressable" acceptance has a real, testable owner (agent-tui-review.md
// Critical finding 2 — TraceYank absent from the key model).

/**
 * The trace-yank chord set — the second key of each `y _` chord, mapped to the
 * identity it copies. Bare ids only, no decoration (DESIGN.md §4.10).
 */
export const TRACE_YANK_CHORDS = {
  t: "trace",
  r: "run",
  s: "span",
  p: "project",
} as const;

/** Second-key of a `y _` trace-clipboard chord. */
export type TraceYankKey = keyof typeof TRACE_YANK_CHORDS;

/** Identity kind a trace-yank chord copies. */
export type TraceYankTarget = (typeof TRACE_YANK_CHORDS)[TraceYankKey];

/**
 * Keys that own list navigation / stage chords (CLI-TUI-UX.md §7.2 stage
 * chords, §7.3 list navigation). The trace-yank prefix `y` must never collide
 * with any of these — `y` is unused by both, so the `y` family is collision
 * free. The set is asserted by `traceYankCollides()` so a future binding that
 * steals `y` is caught by the FakeTTY tests.
 */
const RESERVED_NAVIGATION_KEYS: ReadonlySet<string> = new Set([
  // §7.3 list navigation
  "j",
  "k",
  "o",
  "c",
  "e",
  "x",
  "V",
  // §7.2 stage chords — the `g _` go-to-stage prefix
  "g",
]);

/**
 * Whether `key` collides with a reserved list-navigation / stage-chord key.
 * The trace-yank prefix is `y`; this guard proves `y` is free of collisions.
 */
export function traceYankCollides(key: string): boolean {
  return RESERVED_NAVIGATION_KEYS.has(key);
}

/**
 * The identity source a trace yank reads. `copyKeybinds()` is the same map
 * `StatusBarWidget.copyKeybinds()` returns (`{"y t": <trace>, "y r": <run>,
 * "y s": <span>}`) — the yank copies exactly the identity the footer renders.
 * `projectPath` backs `y p`, which the footer does not carry as a segment.
 */
export interface TraceYankSource {
  /** StatusFooter copy-keybind map: `y t`/`y r`/`y s` → bare identity id. */
  copyKeybinds(): Record<string, string>;
  /** Absolute project path the implicit scope is bound to (backs `y p`). */
  projectPath?: string | null;
}

/**
 * Clipboard sink for trace yanks. Injected so the FakeTTY tests can assert the
 * exact payload without coupling to the OS clipboard; the production default
 * (`osc52Clipboard`) writes the OSC 52 terminal-clipboard escape sequence —
 * the dependency-free clipboard primitive tmux / Helix / k9s use.
 */
export interface TraceYankClipboard {
  /** Copy `text` to the clipboard. */
  write(text: string): void;
}

/** Base64 encoder available in both Bun runtime and test environments. */
function toBase64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

/**
 * Production clipboard sink: writes the OSC 52 escape sequence to a terminal
 * writer so the host terminal copies `text` to the system clipboard. No OS
 * shell-out, no dependency — `\x1b]52;c;<base64>\x07`.
 */
export function osc52Clipboard(writer: { write(data: string): void }): TraceYankClipboard {
  return {
    write(text: string): void {
      writer.write(`\x1b]52;c;${toBase64(text)}\x07`);
    },
  };
}

/** Result of a trace-yank key resolution. */
export interface TraceYankResult {
  /** Identity kind copied (`trace`/`run`/`span`/`project`). */
  target: TraceYankTarget;
  /** The bare identity value written to the clipboard. */
  value: string;
}

/**
 * A trace-yank handler: feed it the second key of a `y _` chord and it copies
 * the matching identity to the clipboard, returning what it yanked. The chord
 * prefix `y` is owned by the caller — once `y` is seen, the next key is routed
 * here. Returns `null` when the key is not a trace-yank key or the identity is
 * absent (e.g. `y s` with no active span).
 */
export interface TraceYankHandler {
  /** Whether `key` is a trace-yank second-key (`t`/`r`/`s`/`p`). */
  isYankKey(key: string): key is TraceYankKey;
  /**
   * Resolve a `y _` chord: copy the identity for `key` to the clipboard.
   * Returns the yanked `{target,value}` or `null` if `key` is not a yank key
   * or the identity is not currently available.
   */
  yank(key: string): TraceYankResult | null;
}

/**
 * Build a trace-yank handler bound to `source` (the StatusFooter identity) and
 * `clipboard` (the sink). The yank payloads are read straight from
 * `source.copyKeybinds()` so a yank can never drift from the footer segment it
 * mirrors; `y p` reads `source.projectPath`. Payloads are bare ids — no
 * `trace:` prefix, no decoration (DESIGN.md §4.10, copy_assertions).
 */
export function createTraceYankHandler(
  source: TraceYankSource,
  clipboard: TraceYankClipboard,
): TraceYankHandler {
  const valueFor = (target: TraceYankTarget): string | null => {
    if (target === "project") {
      const path = source.projectPath;
      return path && path.length > 0 ? path : null;
    }
    const keybinds = source.copyKeybinds();
    // `copyKeybinds()` keys the identities by the full `y _` chord string.
    const chord = target === "trace" ? "y t" : target === "run" ? "y r" : "y s";
    const value = keybinds[chord];
    return value && value.length > 0 ? value : null;
  };

  return {
    isYankKey(key: string): key is TraceYankKey {
      return key in TRACE_YANK_CHORDS;
    },
    yank(key: string): TraceYankResult | null {
      if (!(key in TRACE_YANK_CHORDS)) return null;
      const target = TRACE_YANK_CHORDS[key as TraceYankKey];
      const value = valueFor(target);
      if (value === null) return null;
      clipboard.write(value);
      return { target, value };
    },
  };
}
