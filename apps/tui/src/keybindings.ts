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

// ─── StageChord — the `g _` stage-jump key map (CLI-TUI-UX.md §7.2) ─────────
//
// A StageChord is a two-key navigation chord that jumps between the six
// workflow stages (apps/tui/CONTEXT.md StageChord). The first key is always
// `g`; the second key selects the stage:
//
//   g c → Capture   g p → Plan      g b → Build (runs feed)
//   g B → Build · board view        g r → Review
//   g s → Ship      g o → Operate / doctor
//
// `g B` is a distinct second key from `g b` — uppercase opens the Build board,
// lowercase the runs feed (CLI-TUI-UX.md §7.2, OD tui-runs.html:1148-1154).
// agent-tui-review.md Critical finding 3 names the absent `g`-chord state
// machine a critical gap; this module owns it so the navigation key model has
// a real, FakeTTY-testable owner.

/**
 * The StageChord map — the second key of each `g _` chord, mapped to the colon
 * route of the stage screen it opens. Routes resolve through
 * `screen-registry.ts` `resolveColonRoute()`; the lower/upper `b`/`B` split is
 * intentional and matches CLI-TUI-UX.md §7.2.
 */
export const STAGE_CHORDS: Readonly<Record<string, string>> = {
  c: ":capture",
  p: ":plan",
  b: ":runs",
  B: ":board",
  r: ":review",
  s: ":ship",
  o: ":doctor",
} as const;

/** Second key of a `g _` StageChord. */
export type StageChordKey = keyof typeof STAGE_CHORDS;

/** The chord prefix that opens a StageChord (`g`, then a stage key). */
export const STAGE_CHORD_PREFIX = "g" as const;

/** A resolved StageChord — the second key plus the colon route it opens. */
export interface StageChordResult {
  /** Second key pressed (`c`/`p`/`b`/`B`/`r`/`s`/`o`). */
  key: StageChordKey;
  /** Colon route of the stage screen the chord opens (`:capture`, …). */
  route: string;
}

/**
 * A StageChord handler: once the `g` prefix is seen the next key is routed
 * here. Returns the stage route for a valid second key, `null` otherwise (so a
 * stray `g x` cancels the chord instead of navigating).
 */
export interface StageChordHandler {
  /** Whether `key` is a valid StageChord second key. */
  isChordKey(key: string): key is StageChordKey;
  /**
   * Resolve a `g _` chord: return the `{key,route}` for `key`, or `null` when
   * `key` is not a stage second key. The caller navigates to `route`.
   */
  resolve(key: string): StageChordResult | null;
}

/**
 * Build a StageChord handler. Stateless — the caller owns the `g`-prefix
 * latch (see {@link createChordLatch}); this resolves the second key only.
 */
export function createStageChordHandler(): StageChordHandler {
  return {
    isChordKey(key: string): key is StageChordKey {
      return key in STAGE_CHORDS;
    },
    resolve(key: string): StageChordResult | null {
      if (!(key in STAGE_CHORDS)) return null;
      return { key: key as StageChordKey, route: STAGE_CHORDS[key as StageChordKey]! };
    },
  };
}

// ─── Chord-prefix latch — collision-free `g` / `y` two-key sequencing ───────
//
// Two chord families share a single keystroke stream: `g _` StageChords and
// `y _` trace yanks (§7.6). A ChordLatch is a one-key-deep state machine: feed
// it every key; when it sees a registered prefix it latches and the *next* key
// is reported as the chord's second key. This keeps `g`/`y` from colliding
// with bare list-navigation keys — a bare `g` only arms the latch, it never
// itself navigates, and any non-second-key press (including `Esc`) disarms it.

/** Outcome of feeding one key to a {@link ChordLatch}. */
export type ChordLatchOutcome =
  | { kind: "armed"; prefix: string }
  | { kind: "chord"; prefix: string; key: string }
  | { kind: "cancelled"; prefix: string }
  | { kind: "passthrough"; key: string };

/**
 * A one-key-deep chord-prefix latch. `feed()` returns:
 *  - `armed` — `key` was a prefix; the latch now waits for the second key.
 *  - `chord` — the latch was armed and `key` completes a `<prefix> <key>` chord.
 *  - `cancelled` — the latch was armed but `key` is `Esc`; the chord is dropped.
 *  - `passthrough` — `key` is neither a prefix nor a latched second key.
 */
export interface ChordLatch {
  /** Feed one key; advances the latch and reports the outcome. */
  feed(key: string): ChordLatchOutcome;
  /** Whether the latch is currently waiting for a chord's second key. */
  readonly armed: boolean;
  /** The armed prefix, or `null` when idle. */
  readonly prefix: string | null;
  /** Drop any armed state (e.g. when a screen changes under the latch). */
  reset(): void;
}

/**
 * Build a chord latch that recognises the given chord `prefixes` (`["g","y"]`
 * for the TUI — StageChord + trace-yank). When armed, the very next key is the
 * chord's second key; `Esc` while armed cancels. A second prefix press while
 * armed re-arms on the new prefix rather than emitting a chord, so `g g` (which
 * §7.1 maps to "jump to first") is reported as a `g g` chord — the caller
 * decides whether `g`-as-second-key means anything.
 */
export function createChordLatch(prefixes: readonly string[]): ChordLatch {
  const prefixSet = new Set(prefixes);
  let armedPrefix: string | null = null;

  return {
    feed(key: string): ChordLatchOutcome {
      if (armedPrefix !== null) {
        const prefix = armedPrefix;
        armedPrefix = null;
        if (key === "\x1b" || key === "escape") {
          return { kind: "cancelled", prefix };
        }
        return { kind: "chord", prefix, key };
      }
      if (prefixSet.has(key)) {
        armedPrefix = key;
        return { kind: "armed", prefix: key };
      }
      return { kind: "passthrough", key };
    },
    get armed(): boolean {
      return armedPrefix !== null;
    },
    get prefix(): string | null {
      return armedPrefix;
    },
    reset(): void {
      armedPrefix = null;
    },
  };
}

/**
 * The chord prefixes the TUI shell latches: `g` (StageChord, §7.2) and `y`
 * (trace yank, §7.6). They are disjoint from every list-navigation key
 * (`traceYankCollides()` proves it) so the latch never steals a bare key.
 */
export const TUI_CHORD_PREFIXES: readonly string[] = [STAGE_CHORD_PREFIX, "y"];

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
