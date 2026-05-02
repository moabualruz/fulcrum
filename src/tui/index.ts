/**
 * TUI application root — `fulcrum tui` entry-point.
 *
 * Architecture:
 *   - Keyboard-first, ANSI-rendered terminal UI using picocolors.
 *   - OpenTUI was NOT available on npm at pillar start (404) — using raw
 *     terminal + picocolors per the PRD failure gate:
 *     "fall back to ... raw terminal UI via process.stdout.write + ANSI escape codes."
 *   - All screens are headless-testable via FakeTTY injection.
 *   - In-process tRPC caller: zero HTTP — shares needle-di container with CLI.
 *
 * Navigation:
 *   - Two settings entries: "Auth" and "Feature Flags"
 *   - Arrow keys or j/k to navigate settings menu
 *   - Enter/Space to open selected entry
 *   - q to exit (from any screen)
 *
 * Data flow:
 *   - Startup: call auth.whoami() → populate status bar (org + email)
 *   - Each screen loads its data on mount via in-process tRPC caller
 *
 * C4: TUI surface at feature parity path; foundation screen set shipped.
 * C8: needle-di container injected; in-process tRPC caller (no HTTP).
 * P1#15: T15-01 (entrypoint), T15-12 (status bar), T15-56/T15-65/T15-67 (screens).
 */

import type { TuiOutput, TuiInput } from "./testing/fake-tty.ts";
import { StdoutOutput } from "./testing/fake-tty.ts";
import { Renderer, c } from "./renderer.ts";
import { AuthScreen } from "./screens/auth.ts";
import type { AuthInfo } from "./screens/auth.ts";
import { FlagsScreen } from "./screens/flags.ts";
import type { FlagItem } from "./screens/flags.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal in-process tRPC caller shape needed by TUI. */
export interface TuiCaller {
  auth: {
    whoami: () => Promise<{
      userId: string;
      orgId: string;
      email: string | null;
      role: string | null;
    }>;
  };
  flags: {
    list: () => Promise<FlagItem[]>;
    set: (input: { flag: string; enabled: boolean }) => Promise<{ ok: boolean }>;
  };
  inference?: {
    health: () => Promise<{ status: string }>;
  };
}

export interface TuiAppOptions {
  /** Output driver — defaults to real stdout. Inject FakeTTY for tests. */
  output?: TuiOutput;

  /** Input driver — defaults to real stdin. Inject FakeTTY for tests. */
  input?: TuiInput;

  /** In-process tRPC caller. Required. */
  caller: TuiCaller;

  /** Called when the TUI requests a clean exit. */
  onExit?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen enum
// ─────────────────────────────────────────────────────────────────────────────

type Screen = "nav" | "auth" | "flags" | "inference";

// ─────────────────────────────────────────────────────────────────────────────
// Navigation entries
// ─────────────────────────────────────────────────────────────────────────────

interface NavEntry {
  label: string;
  screen: Screen;
}

const NAV_ENTRIES: NavEntry[] = [
  { label: "Auth", screen: "auth" },
  { label: "Feature Flags", screen: "flags" },
  { label: "Inference", screen: "inference" },
  { label: "Dashboard (Pillar 3)", screen: "nav" },
  { label: "Tasks (Pillar 4)", screen: "nav" },
  { label: "Docs (Pillar 7)", screen: "nav" },
  { label: "Memory (Pillar 8)", screen: "nav" },
];

// ─────────────────────────────────────────────────────────────────────────────
// TuiApp
// ─────────────────────────────────────────────────────────────────────────────

export class TuiApp {
  private readonly renderer: Renderer;
  private readonly caller: TuiCaller;
  private readonly onExit: () => void;
  private readonly input: TuiInput | null;

  private currentScreen: Screen = "nav";
  private navCursor = 0;
  private statusInfo: { email: string; orgId: string } | null = null;
  private inferenceInfo: { status: string; tone: "green" | "yellow" | "red" } = {
    status: "down",
    tone: "red",
  };
  private inferencePoll: ReturnType<typeof setInterval> | null = null;
  private running = false;

  // Active screen instances
  private authScreen: AuthScreen | null = null;
  private flagsScreen: FlagsScreen | null = null;

  constructor(opts: TuiAppOptions) {
    const out = opts.output ?? new StdoutOutput();
    this.renderer = new Renderer(out);
    this.caller = opts.caller;
    this.onExit = opts.onExit ?? (() => {
      this.stop();
    });
    this.input = opts.input ?? null;
  }

  /**
   * Mount the TUI: load initial data, render, attach keyboard handler.
   * In headless/test mode (no input driver), renders once and returns.
   */
  async mount(): Promise<void> {
    this.running = true;

    // Load status bar data
    await this._loadStatusBar();
    await this._loadInferenceBadge();
    this.inferencePoll = setInterval(() => {
      void this._loadInferenceBadge().then(() => {
        if (this.running) this._renderCurrentScreen();
      });
    }, 30_000);

    // Initial render
    this._renderCurrentScreen();

    // Attach keyboard listener (no-op in headless mode)
    if (this.input) {
      const handler = (key: string) => {
        void this._handleKey(key);
      };
      this.input.on("keypress", handler);
    }
  }

  /** Stop the TUI cleanly. */
  stop(): void {
    this.running = false;
    if (this.inferencePoll) {
      clearInterval(this.inferencePoll);
      this.inferencePoll = null;
    }
    this.renderer.showCursor();
  }

  /** Whether the TUI is currently running. */
  get isRunning(): boolean {
    return this.running;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Status bar
  // ─────────────────────────────────────────────────────────────────────────

  private async _loadStatusBar(): Promise<void> {
    try {
      const whoami = await this.caller.auth.whoami();
      this.statusInfo = {
        email: whoami.email ?? whoami.userId,
        orgId: whoami.orgId,
      };
    } catch {
      this.statusInfo = { email: "(unauthenticated)", orgId: "local" };
    }
  }

  private _renderStatusBar(): void {
    const info = this.statusInfo;
    const badge = this._formatInferenceBadge();
    if (!info) {
      this.renderer.statusBar("Fulcrum TUI", badge);
      return;
    }
    const left = `${info.orgId}  ${info.email}`;
    const right = `${badge}  q:quit  ?:help`;
    this.renderer.statusBar(left, right);
  }

  private async _loadInferenceBadge(): Promise<void> {
    try {
      const status = (await this.caller.inference?.health())?.status ?? "down";
      this.inferenceInfo = {
        status,
        tone: status === "ok" ? "green" : status === "degraded" ? "yellow" : "red",
      };
    } catch {
      this.inferenceInfo = { status: "down", tone: "red" };
    }
  }

  private _formatInferenceBadge(): string {
    const label = `Inference:${this.inferenceInfo.status}`;
    if (this.inferenceInfo.tone === "green") return c.green(label);
    if (this.inferenceInfo.tone === "yellow") return c.yellow(label);
    return c.red(label);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────────────────────

  private _renderCurrentScreen(): void {
    this.renderer.clearScreen();
    this.renderer.hideCursor();

    this._renderStatusBar();

    switch (this.currentScreen) {
      case "nav":
        this._renderNav();
        break;
      case "auth":
        this._renderAuth();
        break;
      case "flags":
        this._renderFlags();
        break;
      case "inference":
        this._renderInference();
        break;
    }
  }

  private _renderNav(): void {
    const r = this.renderer;
    r.writeln();
    r.writeln(c.bold("  Fulcrum Settings"));
    r.separator();
    r.writeln();

    for (let i = 0; i < NAV_ENTRIES.length; i++) {
      const entry = NAV_ENTRIES[i];
      if (!entry) continue;
      const isOwned = entry.screen === "nav" && entry.label.includes("Pillar");
      const label = isOwned ? c.dim(entry.label) : entry.label;
      r.navItem(label, i === this.navCursor);
    }

    r.writeln();
    r.writeln(c.dim("  j/k navigate  Enter open  q quit"));
  }

  private _renderAuth(): void {
    if (this.authScreen) {
      this.authScreen.render();
    }
  }

  private _renderFlags(): void {
    if (this.flagsScreen) {
      this.flagsScreen.render();
    }
  }

  private _renderInference(): void {
    this.renderer.writeln();
    this.renderer.writeln(c.bold("  Settings › Inference"));
    this.renderer.separator();
    this.renderer.writeln();
    this.renderer.infoRow("Backend", this._formatInferenceBadge());
    this.renderer.writeln();
    this.renderer.writeln(c.dim("  Press [q] to go back"));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard handling
  // ─────────────────────────────────────────────────────────────────────────

  private async _handleKey(key: string): Promise<void> {
    if (!this.running) return;

    // Global quit
    if (key === "q" && this.currentScreen === "nav") {
      this.onExit();
      return;
    }

    // Delegate to active screen
    if (this.currentScreen === "auth" && this.authScreen) {
      const consumed = this.authScreen.handleKey(key);
      if (!consumed) return;
      this._renderCurrentScreen();
      return;
    }

    if (this.currentScreen === "flags" && this.flagsScreen) {
      const consumed = await this.flagsScreen.handleKey(key);
      if (!consumed) return;
      this._renderCurrentScreen();
      return;
    }

    if (this.currentScreen === "inference") {
      if (key === "q" || key === "\x1b") {
        this.currentScreen = "nav";
        this._renderCurrentScreen();
      }
      return;
    }

    // Nav screen
    if (this.currentScreen === "nav") {
      await this._handleNavKey(key);
    }
  }

  private async _handleNavKey(key: string): Promise<void> {
    if (key === "j" || key === "\x1b[B") {
      this.navCursor = Math.min(this.navCursor + 1, NAV_ENTRIES.length - 1);
      this._renderCurrentScreen();
      return;
    }
    if (key === "k" || key === "\x1b[A") {
      this.navCursor = Math.max(this.navCursor - 1, 0);
      this._renderCurrentScreen();
      return;
    }
    if (key === "\r" || key === "\n" || key === " ") {
      await this._openSelected();
      return;
    }
  }

  private async _openSelected(): Promise<void> {
    const entry = NAV_ENTRIES[this.navCursor];
    if (!entry) return;

    // Stub entries (owned by later pillars)
    if (entry.screen === "nav") {
      this.renderer.writeln(c.yellow(`  Owned by a later pillar — not yet implemented.`));
      return;
    }

    await this._navigate(entry.screen);
  }

  private async _navigate(screen: Screen): Promise<void> {
    this.currentScreen = screen;

    if (screen === "auth") {
      let authInfo: AuthInfo;
      try {
        const whoami = await this.caller.auth.whoami();
        authInfo = {
          userId: whoami.userId,
          orgId: whoami.orgId,
          email: whoami.email,
          role: whoami.role,
          orgName: whoami.orgId,
          passkeyCount: 0,
          saasAuthEnabled: false,
          authProviders: [],
        };
      } catch {
        authInfo = {
          userId: "unknown",
          orgId: "local",
          email: null,
          role: null,
        };
      }
      this.authScreen = new AuthScreen(this.renderer, authInfo, {
        onExit: () => {
          this.currentScreen = "nav";
          this._renderCurrentScreen();
        },
      });
    }

    if (screen === "flags") {
      this.flagsScreen = new FlagsScreen(this.renderer, {
        caller: this.caller,
        onExit: () => {
          this.currentScreen = "nav";
          this._renderCurrentScreen();
        },
      });
      await this.flagsScreen.load();
    }

    if (screen === "inference") {
      await this._loadInferenceBadge();
    }

    this._renderCurrentScreen();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Headless helpers (for tests)
  // ─────────────────────────────────────────────────────────────────────────

  /** Navigate to a screen directly (for tests — bypasses keyboard). */
  async navigateTo(screen: Screen): Promise<void> {
    await this._navigate(screen);
  }

  /** Current screen name (for tests). */
  get screen(): Screen {
    return this.currentScreen;
  }

  /** Status bar info resolved from auth.whoami (for tests). */
  get statusBarInfo(): { email: string; orgId: string } | null {
    return this.statusInfo;
  }

  get inferenceBadge(): { status: string; tone: "green" | "yellow" | "red" } {
    return this.inferenceInfo;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildCaller — production in-process tRPC caller factory
// ─────────────────────────────────────────────────────────────────────────────

export async function buildCaller(
  container: import("@needle-di/core").Container | null = null,
): Promise<TuiCaller> {
  const { t } = await import("../trpc/trpc.ts");
  const { appRouter } = await import("../trpc/router.ts");
  const { createContext } = await import("../trpc/context.ts");

  const ctx = createContext({ session: null, orgId: null, userId: null, em: null, container });
  const factory = t.createCallerFactory(appRouter);
  // Cast: TuiCaller is a structural subset of the full AppRouter caller
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return factory(ctx) as any;
}
