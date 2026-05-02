/**
 * TUI application root — `fulcrum tui` entry-point.
 *
 * Architecture:
 *   - Keyboard-first, ANSI-rendered terminal UI using picocolors.
 *   - OpenTUI is the target renderer, but this repo does not yet carry
 *     @opentui/core in package.json. This foundation keeps the existing
 *     ANSI renderer so router/input/error/caller behavior is testable before
 *     the renderer swap is gated.
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

import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import { Container } from "@needle-di/core";
import type { Session as BetterAuthSession } from "better-auth";
import type { TuiOutput, TuiInput } from "./testing/fake-tty.ts";
import { StdoutOutput } from "./testing/fake-tty.ts";
import { Renderer, c } from "./renderer.ts";
import { AuthScreen } from "./screens/auth.ts";
import type { AuthInfo } from "./screens/auth.ts";
import { FlagsScreen } from "./screens/flags.ts";
import type { FlagItem } from "./screens/flags.ts";
import { TuiRouter, type TuiRoute } from "./router.ts";
import { JsonlCrashLog, type TuiCrashLog } from "./crashlog.ts";
import { DbTelemetrySink, NullTelemetrySink, type TuiTelemetrySink } from "./telemetry.ts";
import { ENTITY_MANAGER_TOKEN, registerDbBindings } from "../db/db.module.ts";
import type { InferenceModel, ModelPullProgress } from "../inference/protocol.ts";

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
      orgName?: string | null;
      passkeyCount?: number;
      saasAuthEnabled?: boolean;
      authProviders?: string[];
    }>;
  };
  flags: {
    list: () => Promise<FlagItem[]>;
    set: (input: { flag: string; enabled: boolean }) => Promise<{ ok: boolean }>;
  };
  tasks?: {
    list: () => Promise<Array<{ id: string; orgId: string | null }>>;
  };
  inference?: {
    health: () => Promise<{ status: string }>;
    models?: {
      list: () => Promise<InferenceModel[]>;
      pull: (input: { modelId: string; force?: boolean }) => AsyncIterable<ModelPullProgress> | Promise<AsyncIterable<ModelPullProgress>>;
    };
  };
}

export type TuiAction = "CreateItem";

export interface TuiAppOptions {
  /** Output driver — defaults to real stdout. Inject FakeTTY for tests. */
  output?: TuiOutput;

  /** Input driver — defaults to real stdin. Inject FakeTTY for tests. */
  input?: TuiInput;

  /** In-process tRPC caller. Required. */
  caller: TuiCaller;

  /** Called when the TUI requests a clean exit. */
  onExit?: () => void;

  /** Semantic action handlers keyed by shared keybinding action names. */
  actions?: Partial<Record<TuiAction, () => void | Promise<void>>>;

  /** Optional path router routes for foundation and future screens. */
  routes?: readonly TuiRoute[];

  /** Local render telemetry sink. */
  telemetry?: TuiTelemetrySink;

  /** Crash log writer for render errors. */
  crashLog?: TuiCrashLog;
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
  private readonly actions: Partial<Record<TuiAction, () => void | Promise<void>>>;
  private readonly pathRouter: TuiRouter | null;
  private readonly telemetry: TuiTelemetrySink;
  private readonly crashLog: TuiCrashLog;
  private keyHandler: ((key: string) => void) | null = null;

  private currentScreen: Screen = "nav";
  private currentPath: string | null = null;
  private navCursor = 0;
  private statusInfo: { email: string; orgId: string } | null = null;
  private inferenceInfo: { status: string; tone: "green" | "yellow" | "red" } = {
    status: "down",
    tone: "red",
  };
  private inferenceModels: InferenceModel[] = [];
  private inferencePullProgress: (ModelPullProgress & { modelId: string }) | null = null;
  private inferenceLastDownload: (ModelPullProgress & { modelId: string }) | null = null;
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
    this.actions = opts.actions ?? {};
    this.pathRouter = opts.routes && opts.routes.length > 0
      ? new TuiRouter({
        routes: [
          { path: "/", screenKey: "nav", title: "Root", render: () => "" },
          ...opts.routes,
        ],
      })
      : null;
    this.telemetry = opts.telemetry ?? new NullTelemetrySink();
    this.crashLog = opts.crashLog ?? new JsonlCrashLog();
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
        if (this.running) void this._renderCurrentScreen();
      });
    }, 30_000);

    // Initial render
    await this._renderCurrentScreen();

    // Attach keyboard listener (no-op in headless mode)
    if (this.input) {
      this.keyHandler = (key: string) => {
        void this._handleKey(key);
      };
      this.input.on("keypress", this.keyHandler);
    }
  }

  /** Stop the TUI cleanly. */
  stop(): void {
    this.running = false;
    if (this.inferencePoll) {
      clearInterval(this.inferencePoll);
      this.inferencePoll = null;
    }
    if (this.input && this.keyHandler) {
      this.input.off("keypress", this.keyHandler);
      this.keyHandler = null;
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
        orgId: whoami.orgName ?? whoami.orgId,
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

  private async _loadInferenceModels(): Promise<void> {
    try {
      this.inferenceModels = await this.caller.inference?.models?.list() ?? [];
    } catch {
      this.inferenceModels = [];
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

  private async _renderCurrentScreen(): Promise<void> {
    const started = performance.now();
    const screenKey = this.currentPath && this.pathRouter
      ? this.pathRouter.current.screenKey
      : this.currentScreen;
    const route = this.currentPath ?? this.currentScreen;

    try {
      this.renderer.clearScreen();
      this.renderer.hideCursor();
      this._renderStatusBar();

      if (this.currentPath && this.pathRouter) {
        const body = this.pathRouter.render();
        if (body) this.renderer.writeln(body);
        return;
      }

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
    } catch (error) {
      this.renderer.clearScreen();
      this.renderer.writeln(c.bold("TUI error"));
      this.renderer.writeln(error instanceof Error ? error.message : String(error));
      await this.crashLog.write(error, { screenKey, route });
    } finally {
      await this.telemetry.recordRender({
        kind: "local_telemetry",
        screenKey,
        route,
        renderMs: Math.max(0, performance.now() - started),
        occurredAt: new Date(),
      });
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
    const r = this.renderer;
    r.writeln();
    r.writeln(c.bold("  Settings › Inference"));
    r.separator();
    r.writeln();
    r.infoRow("Backend", this._formatInferenceBadge());
    r.writeln();
    r.writeln(c.bold("  Models"));
    if (this.inferenceModels.length === 0) {
      r.writeln(c.dim("  No inference models configured."));
    } else {
      for (const model of this.inferenceModels) {
        const action = model.downloaded ? "downloaded" : "Download";
        const size = model.sizeBytes ? ` ${model.sizeBytes} bytes` : "";
        r.writeln(`  ${model.id}  ${model.kind}  ${action}${size}`);
      }
    }
    if (this.inferencePullProgress) {
      r.writeln();
      r.writeln(
        `  Downloading ${this.inferencePullProgress.modelId} ${this.inferencePullProgress.pct}% ` +
          `${this.inferencePullProgress.downloaded}/${this.inferencePullProgress.total}`,
      );
    } else if (this.inferenceLastDownload) {
      r.writeln();
      r.writeln(`  Last download ${this.inferenceLastDownload.modelId} ${this.inferenceLastDownload.pct}%`);
    }
    r.writeln();
    r.writeln(c.dim("  Press [q] to go back"));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard handling
  // ─────────────────────────────────────────────────────────────────────────

  private async _handleKey(key: string): Promise<void> {
    if (!this.running) return;

    // Global quit
    if ((key === "q" || key === "\x03") && this.currentScreen === "nav" && !this.currentPath) {
      this.onExit();
      return;
    }

    // Delegate to active screen
    if (this.currentScreen === "auth" && this.authScreen) {
      const consumed = this.authScreen.handleKey(key);
      if (!consumed) return;
      await this._renderCurrentScreen();
      return;
    }

    if (this.currentScreen === "flags" && this.flagsScreen) {
      const consumed = await this.flagsScreen.handleKey(key);
      if (!consumed) return;
      await this._renderCurrentScreen();
      return;
    }

    if (this.currentScreen === "inference") {
      if (key === "q" || key === "\x1b") {
        this.currentScreen = "nav";
        await this._renderCurrentScreen();
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
      await this._renderCurrentScreen();
      return;
    }
    if (key === "k" || key === "\x1b[A") {
      this.navCursor = Math.max(this.navCursor - 1, 0);
      await this._renderCurrentScreen();
      return;
    }
    if (key === "c") {
      await this.actions.CreateItem?.();
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
    this.currentPath = null;
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
          orgName: whoami.orgName ?? whoami.orgId,
          passkeyCount: whoami.passkeyCount ?? 0,
          saasAuthEnabled: whoami.saasAuthEnabled ?? false,
          authProviders: whoami.authProviders ?? [],
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
          void this._renderCurrentScreen();
        },
      });
    }

    if (screen === "flags") {
      this.flagsScreen = new FlagsScreen(this.renderer, {
        caller: this.caller,
        onExit: () => {
          this.currentScreen = "nav";
          void this._renderCurrentScreen();
        },
      });
      await this.flagsScreen.load();
    }

    if (screen === "inference") {
      await this._loadInferenceBadge();
      await this._loadInferenceModels();
    }

    await this._renderCurrentScreen();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Headless helpers (for tests)
  // ─────────────────────────────────────────────────────────────────────────

  /** Navigate to a screen directly (for tests — bypasses keyboard). */
  async navigateTo(screen: Screen): Promise<void> {
    await this._navigate(screen);
  }

  async pullInferenceModel(modelId: string): Promise<void> {
    const pull = this.caller.inference?.models?.pull;
    if (!pull) return;
    const events = await pull({ modelId, force: false });
    for await (const event of events) {
      this.inferencePullProgress = { ...event, modelId };
      await this._renderCurrentScreen();
    }
    if (this.inferencePullProgress) {
      this.inferenceLastDownload = this.inferencePullProgress;
      this.inferencePullProgress = null;
    }
    await this._loadInferenceModels();
    this.inferenceModels = this.inferenceModels.map((model) =>
      model.id === modelId ? { ...model, downloaded: true } : model
    );
    await this._renderCurrentScreen();
  }

  /** Navigate to a router path directly (for tests and future route dispatcher). */
  async navigatePath(path: string): Promise<void> {
    if (!this.pathRouter) {
      throw new Error("TUI path router has no routes.");
    }
    this.currentPath = path;
    this.pathRouter.navigate(path);
    await this._renderCurrentScreen();
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

  const tuiContext = buildTuiContext(container);
  const session = await resolveActiveTuiSession(tuiContext.em);
  const orgId = session?.activeOrganizationId ?? session?.orgId ?? null;
  const userId = session?.userId ?? null;

  const ctx = createContext({
    session: session as unknown as BetterAuthSession | null,
    orgId,
    userId,
    em: tuiContext.em,
    container: tuiContext.container,
  });
  const factory = t.createCallerFactory(appRouter);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const caller = factory(ctx) as any;
  return enrichTuiCaller(caller, tuiContext.em);
}

export async function buildTelemetrySink(
  container: import("@needle-di/core").Container | null = null,
): Promise<TuiTelemetrySink> {
  const tuiContext = buildTuiContext(container);
  const session = await resolveActiveTuiSession(tuiContext.em);
  if (!tuiContext.em || !session) return new NullTelemetrySink();

  try {
    const { Org, User } = await import("../db/entities/auth/index.ts");
    const orgId = session.activeOrganizationId ?? session.orgId;
    const [org, user] = await Promise.all([
      tuiContext.em.findOne(Org, { id: orgId } as never),
      tuiContext.em.findOne(User, { id: session.userId } as never),
    ]);
    if (!org) return new NullTelemetrySink();
    return new DbTelemetrySink({ em: tuiContext.em, org, user });
  } catch {
    return new NullTelemetrySink();
  }
}

function authProvidersFromEnv(): string[] {
  const providers: string[] = [];
  if (process.env["GITHUB_CLIENT_ID"] && process.env["GITHUB_CLIENT_SECRET"]) providers.push("GitHub");
  if (process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]) providers.push("Google");
  return providers;
}

function enrichTuiCaller(caller: TuiCaller, em: EntityManager | null): TuiCaller {
  return {
    flags: caller.flags,
    tasks: caller.tasks,
    inference: caller.inference,
    auth: {
      whoami: async () => {
        const whoami = await caller.auth.whoami();
        if (!em) {
          return {
            ...whoami,
            orgName: whoami.orgId,
            passkeyCount: 0,
            saasAuthEnabled: false,
            authProviders: [],
          };
        }

        const [{ Org, Account }, flags] = await Promise.all([
          import("../db/mikro-orm.config.ts"),
          caller.flags.list().catch(() => []),
        ]);
        const org = await em.findOne(Org, { id: whoami.orgId } as never);
        const passkeyCount = await em.count(Account, {
          providerId: "passkey",
          userId: whoami.userId,
        } as never);
        const saasAuthEnabled = flags.some((flag) => flag.name === "saas-auth" && flag.enabled);

        return {
          ...whoami,
          orgName: org?.name ?? whoami.orgId,
          passkeyCount,
          saasAuthEnabled,
          authProviders: saasAuthEnabled ? authProvidersFromEnv() : [],
        };
      },
    },
  };
}

interface TuiCliSession {
  id: string;
  userId: string;
  orgId: string;
  activeOrganizationId?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
}

function buildTuiContext(container: Container | null): {
  container: Container | null;
  em: EntityManager | null;
} {
  if (!container) return { container: null, em: null };

  try {
    const orm = container.get(MikroORM);
    const em = container.get(ENTITY_MANAGER_TOKEN).fork();
    const requestContainer = new Container();
    requestContainer.bind({ provide: MikroORM, useValue: orm });
    registerDbBindings(requestContainer, orm, em);
    return { container: requestContainer, em };
  } catch {
    return { container, em: null };
  }
}

async function resolveActiveTuiSession(em: EntityManager | null): Promise<TuiCliSession | null> {
  if (!em) return null;

  const { Session } = await import("../db/entities/auth/Session.ts");
  const now = new Date();

  try {
    const session = await em.findOne(
      Session,
      { expiresAt: { $gt: now } },
      { orderBy: { createdAt: "DESC" } },
    );
    if (!session) return null;

    return {
      id: session.id,
      token: session.id,
      userId: session.userId,
      orgId: session.orgId,
      activeOrganizationId: session.activeOrganizationId ?? session.orgId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.createdAt,
      ipAddress: session.ipAddress ?? null,
      userAgent: session.userAgent ?? "fulcrum-tui",
    };
  } catch {
    return null;
  }
}
