/**
 * TUI application root — `fulcrum tui` entry-point.
 *
 * Architecture:
 *   - Keyboard-first terminal UI rendered through the OpenTUI adapter at
 *     runtime and through FakeTTY-compatible output in tests.
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
import { createFulcrumTuiRenderer, type FulcrumTuiRenderer } from "./opentui/adapter.ts";
import { AuthScreen } from "./screens/auth.ts";
import type { AuthInfo } from "./screens/auth.ts";
import { FlagsScreen } from "./screens/flags.ts";
import type { FlagItem } from "./screens/flags.ts";
import { NewDocScreen } from "./screens/new-doc.ts";
import { TaskListScreen } from "./screens/task-list.ts";
import type { TuiTask } from "./screens/task-types.ts";
import { RoutingRulesScreen } from "./screens/routing-rules.ts";
import type { TuiRoutingRule, TuiEnrichedDecision } from "./screens/routing-rules.ts";
import { RunsScreen, RunDetailScreen, type TuiRun } from "./screens/runs.ts";
import {
  PlanningBreakdownScreen,
  type ContinuousUpdateInput,
  type ContinuousUpdateResult,
  type FreeformPlanningPromptInput,
  type FreeformPlanningPromptResult,
  type FreeformWorkStartInput,
  type FreeformWorkStartResult,
  type GuidedAcpPlanningInput,
  type GuidedAcpPlanningResult,
  type PlanningBreakdownInput,
  type PlanningBreakdownMaterializationResult,
  type PlanningBreakdownResult,
  type TechnicalPlanningInput,
  type TechnicalPlanningResult,
  type WorkflowCycleResultView,
} from "./screens/planning-breakdown.ts";
import { NotificationsScreen } from "./screens/notifications.ts";
import { ActivityFeedScreen } from "./screens/activity.ts";
import { NotificationRulesScreen } from "./screens/notification-rules.ts";
import { AuditLogScreen } from "./screens/audit.ts";
import { ArtifactsScreen, type TuiArtifact, type TuiArtifactFilters, type TuiArtifactPreview } from "./screens/artifacts.ts";
import { TuiRouter, type TuiRoute } from "./router.ts";
import { JsonlCrashLog, type TuiCrashLog } from "./crashlog.ts";
import { DbTelemetrySink, NullTelemetrySink, type TuiTelemetrySink } from "./telemetry.ts";
import {
  createTuiLocalCaller,
  requireTuiSessionContext,
  withAgentRunApiCaller,
  withAuditApiCaller,
  withNotificationApiCaller,
  withWorkflowApiCaller,
  withWebhookApiCaller,
} from "./local-caller.ts";
import type { InferenceModel, ModelPullProgress } from "@platform-core/interface/http/inference-api-client.ts";
import type { KeybindingMap, KeybindingAction } from "@platform-core/interface/input-bindings.ts";
import type { TuiTheme } from "./theme/index.ts";
import type { SubscriptionBridge } from "./subscriptions.ts";
import type {
  WorkflowAcceptanceCycleInput,
} from "@workflow-coordination/interface/workflow-cycle.ts";

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
    list: () => Promise<Array<{
      id: string;
      orgId?: string | null;
      title?: string;
      status?: string;
      assigneeId?: string | null;
      assignee?: string | null;
      labels?: string[] | null;
    }>>;
    update?: (input: { id: string; status: string }) => Promise<unknown>;
    create?: (input: { title: string; status: string }) => Promise<unknown>;
    bulk?: (input: { ids: string[]; status?: string; assignee?: string }) => Promise<{ ok: boolean }>;
    previewDependencyRun?: (input: {
      mode: "task" | "board";
      targetTaskIds: string[];
    }) => Promise<import("@execution-orchestration/domain/dependency-run-preview.ts").DependencyRunPreview>;
    dispatchDependencyRun?: (input: {
      mode: "task" | "board";
      targetTaskIds: string[];
      agent: string;
    }) => Promise<import("@execution-orchestration/interface/dependency-run-contracts.ts").DispatchDependencyRunForTasksOutput>;
    dependencyRunLiveFeedback?: (
      input: import("@execution-orchestration/interface/dependency-run-contracts.ts").DependencyRunLiveFeedbackInput,
    ) => Promise<import("@execution-orchestration/interface/dependency-run-contracts.ts").DependencyRunLiveFeedbackOutput>;
    dependencyRunLiveFeedbackStream?: (
      input: import("@execution-orchestration/interface/dependency-run-contracts.ts").DependencyRunLiveFeedbackInput,
    ) => Promise<{
      subscribe(observer: {
        next(value: import("@execution-orchestration/interface/dependency-run-contracts.ts").DependencyRunLiveFeedbackOutput): void;
        error?(error: unknown): void;
        complete?(): void;
      }): { unsubscribe(): void };
    }>;
    recordQaReview?: (
      input: import("@execution-orchestration/interface/dependency-run-contracts.ts").RecordTaskQaReviewInput,
    ) => Promise<import("@execution-orchestration/interface/dependency-run-contracts.ts").TaskQaReviewOutput>;
    manualWorkbench?: (
      input: import("@work-management/interface/manual-workbench.ts").ManualTaskWorkbenchInput,
    ) => Promise<import("@work-management/interface/manual-workbench.ts").ManualTaskWorkbenchOutput>;
  };
  projects?: { list: () => Promise<unknown[]> };
  sprints?: { list: () => Promise<unknown[]> };
  agent_runs?: {
    list: () => Promise<TuiRun[]>;
    get: (input: { id: string }) => Promise<TuiRun>;
    create: (input: { projectId: string; taskId: string; agent: string }) => Promise<TuiRun>;
    cancel: (input: { id: string }) => Promise<{ ok: boolean }>;
  };
  runsSubscriptions?: SubscriptionBridge;
  tasksSubscriptions?: SubscriptionBridge;
  repos?: { list: () => Promise<unknown[]> };
  memories?: { list: (input?: Record<string, unknown>) => Promise<unknown[]>; promote: (input: { id: string }) => Promise<unknown> };
  search?: { query: (input: Record<string, unknown>) => Promise<unknown[]>; suggest?: (input: Record<string, unknown>) => Promise<unknown> };
  inference?: {
    health: () => Promise<{
      status: string;
      active_requests?: number;
      ops_last_10s?: number;
      embed_hit_rate?: number;
      gen_hit_rate?: number;
      cache_db_size?: number;
    }>;
    models?: {
      list: () => Promise<InferenceModel[]>;
      pull: (input: { modelId: string; force?: boolean }) => AsyncIterable<ModelPullProgress> | Promise<AsyncIterable<ModelPullProgress>>;
    };
    config?: {
      get: () => Promise<Record<string, string>>;
      set: (input: { feature: string; backend: string }) => Promise<{ ok: boolean }>;
    };
  };
  docs?: {
    templates: {
      list: (input: Record<string, never>) => Promise<Array<{
        id: string;
        orgId: string;
        projectId: string | null;
        docType: string;
        name: string;
        frontmatterTemplate: Record<string, unknown>;
        bodyTemplate: string;
        isDefault: boolean;
        createdAt: Date;
      }>>;
    };
  };
  notify?: {
    unreadCount: () => Promise<{ count: number }>;
    list?: (input: { tab?: "for-you" | "all"; unread?: boolean; limit?: number; offset?: number }) => Promise<unknown>;
    markRead?: (input: { id: string }) => Promise<unknown>;
    markAllRead?: () => Promise<{ count: number }>;
    mute?: (input: { subjectKind: string; subjectId: string } | { sourceKind: string; sourceId: string }) => Promise<unknown>;
    rules?: {
      list: () => Promise<unknown[]>;
      create: (input: { name: string; eventPattern: Record<string, unknown>; channels: string[]; enabled: boolean }) => Promise<unknown>;
      update: (input: { id: string; enabled?: boolean; name?: string }) => Promise<unknown>;
      delete: (input: { id: string }) => Promise<{ ok: boolean }>;
    };
    quietHours?: {
      get: () => Promise<unknown | null>;
      set: (input: { tz: string; startHour: number; endHour: number; daysOfWeek: number[] }) => Promise<unknown>;
    };
  };
  audit?: {
    query: (input: Record<string, unknown>) => Promise<unknown>;
    export: (input: Record<string, unknown>) => Promise<unknown>;
  };
  artifacts?: {
    list: (input?: TuiArtifactFilters) => Promise<TuiArtifact[]>;
    get: (input: { id: string }) => Promise<TuiArtifactPreview>;
    upload: (input: { path: string }) => Promise<TuiArtifact>;
    download: (input: { id: string; outPath: string }) => Promise<{ ok: boolean; path: string }>;
    archive: (input: { id: string }) => Promise<{ ok: boolean; id: string }>;
    delete: (input: { id: string }) => Promise<{ ok: boolean; id: string }>;
  };
  routing?: {
    list: (input?: Record<string, unknown>) => Promise<TuiRoutingRule[]>;
    create: (input: Record<string, unknown>) => Promise<TuiRoutingRule>;
    update: (input: Record<string, unknown>) => Promise<TuiRoutingRule | null>;
    delete: (input: { id: string }) => Promise<{ ok: boolean }>;
    test: (input: { taskId: string }) => Promise<TuiEnrichedDecision | null>;
    dryRun: (input: { taskJson: Record<string, unknown> }) => Promise<TuiEnrichedDecision | null>;
    drafts: {
      list: (input?: Record<string, unknown>) => Promise<TuiEnrichedDecision[]>;
      approve: (input: { draftId: string }) => Promise<{ ok: boolean }>;
      delete: (input: { draftId: string }) => Promise<{ ok: boolean }>;
      update: (input: Record<string, unknown>) => Promise<{ ok: boolean }>;
    };
  };
  planning?: {
    previewApprovedPlanBreakdown: (input: PlanningBreakdownInput) => Promise<PlanningBreakdownResult>;
    materializeApprovedPlanBreakdown?: (input: PlanningBreakdownInput) => Promise<PlanningBreakdownMaterializationResult>;
    buildFreeformDocsPlanningPrompt?: (input: FreeformPlanningPromptInput) => Promise<FreeformPlanningPromptResult>;
    startFreeformWorkFromDocs?: (input: FreeformWorkStartInput) => Promise<FreeformWorkStartResult>;
    startGuidedAcpPlanningSession?: (input: GuidedAcpPlanningInput) => Promise<GuidedAcpPlanningResult>;
    restartPlanningCycleFromUpdates?: (input: ContinuousUpdateInput) => Promise<ContinuousUpdateResult>;
    generateTechnicalPlanningCycle?: (input: TechnicalPlanningInput) => Promise<TechnicalPlanningResult>;
  };
  workflows?: {
    runAcceptanceCycle?: (input: WorkflowAcceptanceCycleInput) => Promise<WorkflowCycleResultView>;
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

  /**
   * Resolved keybinding map (Pillar 14). When provided, single-character
   * shortcut keys are matched (case-insensitive) against the corresponding
   * action in the action handler table.
   */
  keybindings?: Partial<KeybindingMap>;

  /** Resolved TUI theme contract (Pillar 17). Exposed via `app.theme`. */
  theme?: TuiTheme;

  /** Runtime OpenTUI adapter created by launchTui; omitted in FakeTTY tests. */
  openTuiRenderer?: FulcrumTuiRenderer;

  /** Approved-plan input used when opening the planning breakdown screen. */
  planningInput?: PlanningBreakdownInput;

  /** Freeform-doc prompt input used when requesting ACP planning context. */
  freeformPlanningInput?: FreeformPlanningPromptInput;

  /** Freeform intake input used when starting workflow work from a rough document. */
  freeformStartInput?: FreeformWorkStartInput;

  /** Guided ACP planning input used when starting a protocol-backed planning session. */
  guidedAcpInput?: GuidedAcpPlanningInput;

  /** Continuous update input used when restarting planning from edited docs or ACP state. */
  continuousUpdateInput?: ContinuousUpdateInput;

  /** Planning generation input used when requesting prototype and boilerplate review artifacts. */
  technicalPlanningInput?: TechnicalPlanningInput;

  /** Full workflow-cycle input used when running the acceptance cycle from planning. */
  workflowCycleInput?: WorkflowAcceptanceCycleInput;
}

/** Map keybinding action → semantic TuiAction handler key. */
const KEYBINDING_TO_TUI_ACTION: Partial<Record<KeybindingAction, TuiAction>> = {
  "task.create": "CreateItem",
  "doc.create": "CreateItem",
};

const COMMAND_PALETTE_ACTIONS = [
  "Create task",
  "Create doc",
  "Search",
  "Dispatch run",
  "Settings",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Screen enum
// ─────────────────────────────────────────────────────────────────────────────

type Screen = "nav" | "auth" | "flags" | "inference" | "new-doc" | "inbox" | "activity" | "notification-rules" | "audit" | "artifacts" | "routing-rules" | "planning";
type DomainScreen =
  | "projects"
  | "tasks"
  | "sprints"
  | "docs"
  | "memory"
  | "runs"
  | "repos"
  | "search"
  | "skills"
  | "components"
  | "doctor";

type TuiScreen = Screen | DomainScreen;

// ─────────────────────────────────────────────────────────────────────────────
// Navigation entries
// ─────────────────────────────────────────────────────────────────────────────

interface NavEntry {
  label: string;
  screen: TuiScreen;
}

const NAV_ENTRIES: NavEntry[] = [
  { label: "Projects", screen: "projects" },
  { label: "Tasks", screen: "tasks" },
  { label: "Sprints", screen: "sprints" },
  { label: "Docs", screen: "docs" },
  { label: "Planning", screen: "planning" },
  { label: "Memory", screen: "memory" },
  { label: "Runs", screen: "runs" },
  { label: "Repos", screen: "repos" },
  { label: "Artifacts", screen: "artifacts" },
  { label: "Search", screen: "search" },
  { label: "Notifications", screen: "inbox" },
  { label: "Notification Rules", screen: "notification-rules" },
  { label: "Skills", screen: "skills" },
  { label: "Routing", screen: "routing-rules" },
  { label: "Routing/Skills", screen: "routing-rules" },
  { label: "Inference", screen: "inference" },
  { label: "Components", screen: "components" },
  { label: "Doctor", screen: "doctor" },
  { label: "Doctor/Settings", screen: "doctor" },
  { label: "Auth", screen: "auth" },
  { label: "Feature Flags", screen: "flags" },
  { label: "Activity", screen: "activity" },
  { label: "Audit", screen: "audit" },
];

function defaultPlanningInput(): PlanningBreakdownInput {
  return {
    planId: "tui-planning",
    approvedPlanMarkdown: "# Approved Plan\n\n## Tasks\n",
    traceId: "tui-planning",
    sourceDocRefs: [],
  };
}

function defaultFreeformPlanningInput(): FreeformPlanningPromptInput {
  return {
    userPrompt: "Plan from the selected freeform docs.",
    selectedDocIds: [],
    traceId: "tui-planning",
  };
}

function defaultFreeformStartInput(): FreeformWorkStartInput {
  return {
    title: "TUI freeform brief",
    bodyMd: "Capture rough goals, constraints, and success criteria.",
    userPrompt: "Plan from this freeform document.",
    traceId: "tui-planning",
    modeId: "planning",
  };
}

function defaultGuidedAcpInput(): GuidedAcpPlanningInput {
  return {
    agentName: "codex",
    cwd: "/Users/mkh/workspace/fulcrum",
    userPrompt: "Plan with selected context through ACP.",
    promptTemplateId: "prototype-first",
    selectedDocIds: [],
    traceId: "tui-planning",
    modeId: "planning",
    permissionMode: "review_each_tool",
  };
}

function defaultContinuousUpdateInput(): ContinuousUpdateInput {
  return {
    trigger: "manual_doc_edit",
    userPrompt: "Replan from updated freeform docs.",
    selectedDocIds: [],
    targetTaskIds: [],
    traceId: "tui-planning",
    acpSessionId: "tui-acp",
    modeId: "planning",
  };
}

function defaultTechnicalPlanningInput(): TechnicalPlanningInput {
  return {
    source: "freeform_docs",
    userPrompt: "Generate a technical plan with prototype and boilerplate artifacts.",
    selectedDocIds: [],
    traceId: "tui-planning",
    planId: "tui-planning",
    prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
    boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
    successCriteria: ["Prototype and boilerplate artifacts are visible before approval."],
  };
}

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
  private readonly keybindings: Partial<KeybindingMap> | null;
  private readonly _theme: TuiTheme | null;
  private readonly openTuiRenderer: FulcrumTuiRenderer | null;
  private readonly planningInput: PlanningBreakdownInput;
  private readonly freeformPlanningInput: FreeformPlanningPromptInput;
  private readonly freeformStartInput: FreeformWorkStartInput;
  private readonly guidedAcpInput: GuidedAcpPlanningInput;
  private readonly continuousUpdateInput: ContinuousUpdateInput;
  private readonly technicalPlanningInput: TechnicalPlanningInput;
  private readonly workflowCycleInput?: WorkflowAcceptanceCycleInput;
  private keyHandler: ((key: string) => void) | null = null;

  private currentScreen: Screen = "nav";
  private domainScreen: DomainScreen | null = null;
  private currentPath: string | null = null;
  private navCursor = 0;
  private paletteOpen = false;
  private domainRows: string[] = [];
  private domainError: string | null = null;
  private taskListScreen: TaskListScreen | null = null;
  private statusInfo: { email: string; orgId: string } | null = null;
  private inferenceInfo: { status: string; tone: "green" | "yellow" | "red" } = {
    status: "down",
    tone: "red",
  };
  private inferenceModels: InferenceModel[] = [];
  private inferencePullProgress: (ModelPullProgress & { modelId: string }) | null = null;
  private inferenceLastDownload: (ModelPullProgress & { modelId: string }) | null = null;
  private inferenceHealthExtras: {
    active_requests: number;
    ops_last_10s: number;
    embed_hit_rate: number;
    gen_hit_rate: number;
    cache_db_size: number;
  } = { active_requests: 0, ops_last_10s: 0, embed_hit_rate: 0, gen_hit_rate: 0, cache_db_size: 0 };
  private inferenceRoutingConfig: Record<string, string> = {};
  private inferencePoll: ReturnType<typeof setInterval> | null = null;
  private bellPoll: ReturnType<typeof setInterval> | null = null;
  private bellCount = 0;
  private running = false;

  // Active screen instances
  private authScreen: AuthScreen | null = null;
  private flagsScreen: FlagsScreen | null = null;
  private newDocScreen: NewDocScreen | null = null;
  private routingRulesScreen: RoutingRulesScreen | null = null;
  private notificationsScreen: NotificationsScreen | null = null;
  private activityScreen: ActivityFeedScreen | null = null;
  private notificationRulesScreen: NotificationRulesScreen | null = null;
  private auditLogScreen: AuditLogScreen | null = null;
  private artifactsScreen: ArtifactsScreen | null = null;
  private runsScreen: RunsScreen | null = null;
  private runDetailScreen: RunDetailScreen | null = null;
  private planningScreen: PlanningBreakdownScreen | null = null;

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
    this.keybindings = opts.keybindings ?? null;
    this._theme = opts.theme ?? null;
    this.openTuiRenderer = opts.openTuiRenderer ?? null;
    this.planningInput = opts.planningInput ?? defaultPlanningInput();
    this.freeformPlanningInput = opts.freeformPlanningInput ?? defaultFreeformPlanningInput();
    this.freeformStartInput = opts.freeformStartInput ?? defaultFreeformStartInput();
    this.guidedAcpInput = opts.guidedAcpInput ?? defaultGuidedAcpInput();
    this.continuousUpdateInput = opts.continuousUpdateInput ?? defaultContinuousUpdateInput();
    this.technicalPlanningInput = opts.technicalPlanningInput ?? defaultTechnicalPlanningInput();
    this.workflowCycleInput = opts.workflowCycleInput;
  }

  /** Resolved theme contract (Pillar 17), if injected. */
  get theme(): TuiTheme | null {
    return this._theme;
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
    await this._loadBellCount();
    this.inferencePoll = setInterval(() =>
      this._loadInferenceBadge().then(() => {
        if (this.running) return this._renderCurrentScreen();
      }), 30_000);
    this.bellPoll = setInterval(() =>
      this._loadBellCount().then(() => {
        if (this.running) return this._renderCurrentScreen();
      }), 60_000);

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
    if (this.bellPoll) {
      clearInterval(this.bellPoll);
      this.bellPoll = null;
    }
    if (this.input && this.keyHandler) {
      this.input.off("keypress", this.keyHandler);
      this.keyHandler = null;
    }
    this.taskListScreen?.dispose();
    this.runDetailScreen?.dispose();
    this.renderer.showCursor();
    void this.openTuiRenderer?.dispose();
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
    const right = `Bell:${this.bellCount}  ${badge}  q:quit  ?:help`;
    this.renderer.statusBar(left, right);
  }

  private async _loadBellCount(): Promise<void> {
    try {
      this.bellCount = (await this.caller.notify?.unreadCount())?.count ?? 0;
    } catch {
      this.bellCount = 0;
    }
  }

  private async _loadInferenceBadge(): Promise<void> {
    try {
      const health = await this.caller.inference?.health();
      const status = health?.status ?? "down";
      this.inferenceInfo = {
        status,
        tone: status === "ok" ? "green" : status === "degraded" ? "yellow" : "red",
      };
      this.inferenceHealthExtras = {
        active_requests: health?.active_requests ?? 0,
        ops_last_10s: health?.ops_last_10s ?? 0,
        embed_hit_rate: health?.embed_hit_rate ?? 0,
        gen_hit_rate: health?.gen_hit_rate ?? 0,
        cache_db_size: health?.cache_db_size ?? 0,
      };
    } catch {
      this.inferenceInfo = { status: "down", tone: "red" };
      this.inferenceHealthExtras = { active_requests: 0, ops_last_10s: 0, embed_hit_rate: 0, gen_hit_rate: 0, cache_db_size: 0 };
    }
  }

  private async _loadInferenceModels(): Promise<void> {
    try {
      this.inferenceModels = await this.caller.inference?.models?.list() ?? [];
    } catch {
      this.inferenceModels = [];
    }
  }

  private async _loadInferenceRoutingConfig(): Promise<void> {
    try {
      this.inferenceRoutingConfig = await this.caller.inference?.config?.get() ?? {};
    } catch {
      this.inferenceRoutingConfig = {};
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
        case "new-doc":
          this._renderNewDoc();
          break;
        case "inbox":
          this.notificationsScreen?.render(this.renderer);
          break;
        case "activity":
          this.activityScreen?.render(this.renderer);
          break;
        case "notification-rules":
          this.notificationRulesScreen?.render(this.renderer);
          break;
        case "audit":
          this.auditLogScreen?.render(this.renderer);
          break;
        case "artifacts":
          this.artifactsScreen?.render(this.renderer);
          break;
        case "routing-rules":
          this.routingRulesScreen?.render(this.renderer);
          break;
        case "planning":
          this._renderPlanning();
          break;
      }
      if (this.domainScreen && this.currentScreen === "nav") {
        this._renderDomainScreen(this.domainScreen);
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
    r.writeln(c.bold("  Fulcrum TUI"));
    r.separator();
    r.writeln();
    r.writeln(c.bold("  Domain nav"));

    for (let i = 0; i < NAV_ENTRIES.length; i++) {
      const entry = NAV_ENTRIES[i];
      if (!entry) continue;
      r.navItem(entry.label, i === this.navCursor);
    }

    r.writeln();
    r.writeln(c.bold("  Detail / log pane"));
    const selected = NAV_ENTRIES[this.navCursor];
    r.writeln(`  ${selected?.label ?? "No domain"} ready. Use Enter to open, / for command palette.`);
    r.writeln();
    r.writeln(c.bold("  Status footer"));
    r.writeln(c.dim("  j/k or arrows navigate  Enter open  Esc back  / commands  q quit"));
    this._renderCommandPalette();
  }

  private _renderCommandPalette(): void {
    if (!this.paletteOpen) {
      this.renderer.writeln(c.dim(`  Command palette: /  ${COMMAND_PALETTE_ACTIONS.join(" | ")}`));
      return;
    }
    this.renderer.writeln();
    this.renderer.writeln(c.bold("  Command palette"));
    for (const action of COMMAND_PALETTE_ACTIONS) this.renderer.writeln(`  - ${action}`);
  }

  private _renderDomainScreen(screen: DomainScreen): void {
    const r = this.renderer;
    if (screen === "tasks" && this.taskListScreen) {
      this.taskListScreen.render(r);
      return;
    }
    r.writeln();
    r.writeln(c.bold(`  ${domainTitle(screen)}`));
    r.separator();

    if (screen === "runs") {
      r.writeln(c.bold("  Run list"));
      this.runsScreen?.render(r);
      r.writeln();
      r.writeln(c.bold("  Transcript / log"));
      this.runDetailScreen?.render(r);
      r.writeln();
      r.writeln(c.bold("  Status footer"));
      const run = this.currentRunForFooter;
      r.writeln(c.dim(run ? `  state:${run.status}  duration:live  agent:${run.agent}` : "  no active run"));
      return;
    }

    r.writeln(c.bold("  Detail / log pane"));
    if (this.domainError) {
      r.writeln(c.red(`  ${this.domainError}`));
    } else if (this.domainRows.length === 0) {
      r.writeln(c.dim(`  No ${domainTitle(screen).toLowerCase()} records.`));
    } else {
      for (const row of this.domainRows) r.writeln(`  ${row}`);
    }
    r.writeln();
    r.writeln(c.bold("  Status footer"));
    r.writeln(c.dim("  Esc back  / commands  q root quit"));
  }

  private get currentRunForFooter(): TuiRun | null {
    return this.runDetailScreen?.currentRun ?? null;
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
    r.infoRow("In-flight", `${this.inferenceHealthExtras.active_requests}`);
    r.infoRow("Throughput", `${this.inferenceHealthExtras.ops_last_10s} ops/s`);
    r.writeln();

    // Cache stats
    r.writeln(c.bold("  Cache"));
    r.infoRow("Embed hit rate", `${this.inferenceHealthExtras.embed_hit_rate}%`);
    r.infoRow("Gen hit rate", `${this.inferenceHealthExtras.gen_hit_rate}%`);
    if (this.inferenceHealthExtras.cache_db_size > 0) {
      const sizeKiB = Math.round(this.inferenceHealthExtras.cache_db_size / 1024);
      r.infoRow("DB size", `${sizeKiB} KiB`);
    }
    r.writeln();

    // Models
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

    // Download progress bar overlay
    if (this.inferencePullProgress) {
      r.writeln();
      const pct = this.inferencePullProgress.pct;
      const barWidth = 30;
      const filled = Math.round((pct / 100) * barWidth);
      const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
      r.writeln(
        `  Downloading ${this.inferencePullProgress.modelId}  [${bar}] ${pct}% ` +
          `${this.inferencePullProgress.downloaded}/${this.inferencePullProgress.total}`,
      );
    } else if (this.inferenceLastDownload) {
      r.writeln();
      r.writeln(`  Last download ${this.inferenceLastDownload.modelId} ${this.inferenceLastDownload.pct}%`);
    }
    r.writeln();

    // Per-feature backend routing
    r.writeln(c.bold("  Routing"));
    const routingEntries = Object.entries(this.inferenceRoutingConfig);
    if (routingEntries.length === 0) {
      r.writeln(c.dim("  No per-feature routing configured."));
    } else {
      for (const [feature, backend] of routingEntries) {
        r.writeln(`  ${feature}: ${backend}`);
      }
    }

    // External LLM Provider — shown only when flag enabled
    const externalEnabled = (process.env["FULCRUM_FEATURES"] ?? "")
      .split(",").map((s) => s.trim()).includes("external-llm-provider");
    if (externalEnabled) {
      r.writeln();
      r.writeln(c.bold("  External LLM Provider"));
      const url = process.env["FULCRUM_INFERENCE_URL"] ?? "(not set)";
      const key = process.env["FULCRUM_INFERENCE_API_KEY"] ? "••••" : "(not set)";
      r.infoRow("URL", url);
      r.infoRow("API Key", key);
    }

    r.writeln();
    r.writeln(c.dim("  Press [q] to go back"));
  }

  private _renderNewDoc(): void {
    if (this.newDocScreen) {
      this.newDocScreen.render();
    } else {
      this.renderer.writeln();
      this.renderer.writeln(c.bold("  New Document"));
      this.renderer.separator();
      this.renderer.writeln();
      this.renderer.writeln(c.dim("  Docs service not available. Run fulcrum init first."));
      this.renderer.writeln();
      this.renderer.writeln(c.dim("  Press [q] to go back"));
    }
  }

  private _renderPlanning(): void {
    if (this.planningScreen) {
      this.planningScreen.render(this.renderer);
      return;
    }
    this.renderer.writeln();
    this.renderer.writeln(c.bold("  Planning breakdown"));
    this.renderer.separator();
    this.renderer.writeln();
    this.renderer.writeln(c.dim("  Planning caller unavailable."));
    this.renderer.writeln();
    this.renderer.writeln(c.dim("  Press [q] to go back"));
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

    // Keybinding registry dispatch (Pillar 14). Resolves single-character
    // shortcuts to semantic TuiActions before per-screen routing.
    const tuiAction = this._resolveKeybindingAction(key);
    if (tuiAction) {
      const handler = this.actions[tuiAction];
      if (handler) {
        await handler();
        return;
      }
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

    if (this.domainScreen) {
      if (key === "q" || key === "\x1b") {
        this.domainScreen = null;
        this.taskListScreen?.dispose();
        this.taskListScreen = null;
        this.currentScreen = "nav";
        await this._renderCurrentScreen();
        return;
      }
      if (key === "/") {
        this.paletteOpen = !this.paletteOpen;
        await this._renderCurrentScreen();
        return;
      }
      if (this.domainScreen === "tasks" && this.taskListScreen) {
        const consumed = await this.taskListScreen.handleKey(key);
        if (consumed) await this._renderCurrentScreen();
        return;
      }
      return;
    }

    if (this.currentScreen === "new-doc" && this.newDocScreen) {
      const consumed = await this.newDocScreen.handleKey(key);
      if (!consumed) return;
      await this._renderCurrentScreen();
      return;
    }

    if (this.currentScreen === "new-doc" && !this.newDocScreen) {
      if (key === "q" || key === "\x1b") {
        this.currentScreen = "nav";
        await this._renderCurrentScreen();
        return;
      }
      if (key === "\x03") {
        this.onExit();
      }
      return;
    }

    if (this.currentScreen === "inbox" && this.notificationsScreen) {
      if (key === "q" || key === "\x1b") {
        this.currentScreen = "nav";
        await this._renderCurrentScreen();
        return;
      }
      const consumed = await this.notificationsScreen.handleKey(key);
      if (consumed) await this._renderCurrentScreen();
      return;
    }

    if (this.currentScreen === "activity" && this.activityScreen) {
      if (key === "q" || key === "\x1b") {
        this.currentScreen = "nav";
        await this._renderCurrentScreen();
        return;
      }
      const consumed = await this.activityScreen.handleKey(key);
      if (consumed) await this._renderCurrentScreen();
      return;
    }

    if (this.currentScreen === "notification-rules" && this.notificationRulesScreen) {
      if (key === "q" || key === "\x1b") {
        this.currentScreen = "nav";
        await this._renderCurrentScreen();
        return;
      }
      const consumed = await this.notificationRulesScreen.handleKey(key);
      if (consumed) await this._renderCurrentScreen();
      return;
    }

    if (this.currentScreen === "audit" && this.auditLogScreen) {
      if (key === "q" || key === "\x1b") {
        this.currentScreen = "nav";
        await this._renderCurrentScreen();
        return;
      }
      const consumed = await this.auditLogScreen.handleKey(key);
      if (consumed) await this._renderCurrentScreen();
      return;
    }

    if (this.currentScreen === "artifacts" && this.artifactsScreen) {
      if (key === "q" || key === "\x1b") {
        this.currentScreen = "nav";
        await this._renderCurrentScreen();
        return;
      }
      const consumed = await this.artifactsScreen.handleKey(key);
      if (consumed) await this._renderCurrentScreen();
      return;
    }

    if (this.currentScreen === "routing-rules") {
      if (key === "q" || key === "\x1b") {
        this.currentScreen = "nav";
        await this._renderCurrentScreen();
        return;
      }
      const consumed = this.routingRulesScreen
        ? await this.routingRulesScreen.handleKey(key)
        : false;
      if (consumed) await this._renderCurrentScreen();
      return;
    }

    if (this.currentScreen === "planning") {
      if (key === "q" || key === "\x1b") {
        this.currentScreen = "nav";
        await this._renderCurrentScreen();
        return;
      }
      const consumed = this.planningScreen ? await this.planningScreen.handleKey(key) : false;
      if (consumed) await this._renderCurrentScreen();
      return;
    }

    // Nav screen
    if (this.currentScreen === "nav") {
      await this._handleNavKey(key);
    }
  }

  private _resolveKeybindingAction(key: string): TuiAction | null {
    if (!this.keybindings) return null;
    if (!key || key.length !== 1) return null;
    const upper = key.toUpperCase();
    for (const [action, binding] of Object.entries(this.keybindings)) {
      if (!binding) continue;
      // Only match plain single-character shortcuts (no Ctrl/Alt/Shift chord).
      if (binding.key.length === 1 && binding.key.toUpperCase() === upper) {
        const tuiAction = KEYBINDING_TO_TUI_ACTION[action as KeybindingAction];
        if (tuiAction) return tuiAction;
      }
    }
    return null;
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
    if (key === "\x1b") {
      this.paletteOpen = false;
      await this._renderCurrentScreen();
      return;
    }
    if (key === "/") {
      this.paletteOpen = !this.paletteOpen;
      await this._renderCurrentScreen();
      return;
    }
    if (key === "n") {
      await this._openNewDoc();
      return;
    }
    if (key === "I") {
      await this._navigate("inbox");
      return;
    }
    if (key === "A") {
      await this._navigate("activity");
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

  private async _openNewDoc(): Promise<void> {
    this.currentPath = null;
    this.currentScreen = "new-doc";

    const docsCaller = this.caller.docs;
    if (docsCaller) {
      this.newDocScreen = new NewDocScreen(this.renderer, {
        caller: docsCaller,
        onExit: () => {
          this.currentScreen = "nav";
          void this._renderCurrentScreen();
        },
      });
      try {
        await this.newDocScreen.load();
      } catch (error) {
        this.newDocScreen.setLoadError(error);
      }
    } else {
      // docs caller not available: render error state.
      this.newDocScreen = null;
    }

    await this._renderCurrentScreen();
  }

  private async _openSelected(): Promise<void> {
    const entry = NAV_ENTRIES[this.navCursor];
    if (!entry) return;

    await this._navigate(entry.screen);
  }

  private async _navigate(screen: TuiScreen): Promise<void> {
    this.currentPath = null;
    this.domainScreen = null;
    this.currentScreen = "nav";
    this.paletteOpen = false;

    if (isDomainScreen(screen)) {
      this.domainScreen = screen;
      await this._loadDomainRows(screen);
      await this._renderCurrentScreen();
      return;
    }

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
      await Promise.all([
        this._loadInferenceBadge(),
        this._loadInferenceModels(),
        this._loadInferenceRoutingConfig(),
      ]);
    }

    if (screen === "inbox") {
      this.notificationsScreen = this.caller.notify?.list && this.caller.notify.markRead && this.caller.notify.mute
        ? new NotificationsScreen({
          caller: { notify: tuiNotifyCaller(this.caller.notify) as never },
          initialBellCount: this.bellCount,
          onOpenEntity: (entity) => {
            this.renderer.writeln(c.dim(`  Open ${entity.kind}:${entity.id}`));
          },
        })
        : null;
      await this.notificationsScreen?.load();
    }

    if (screen === "activity") {
      this.activityScreen = this.caller.audit
        ? new ActivityFeedScreen({
          caller: { audit: this.caller.audit as never },
          filterChips: {
            kind: ["task", "doc", "agent_run"],
            verb: ["created", "updated", "completed"],
            actor: [],
          },
        })
        : null;
      await this.activityScreen?.load();
    }

    if (screen === "notification-rules") {
      this.notificationRulesScreen = this.caller.notify?.rules && this.caller.notify.quietHours
        ? new NotificationRulesScreen({ caller: { notify: this.caller.notify as never } })
        : null;
      await this.notificationRulesScreen?.load();
    }

    if (screen === "audit") {
      this.auditLogScreen = this.caller.audit
        ? new AuditLogScreen({ caller: { audit: this.caller.audit as never } })
        : null;
      await this.auditLogScreen?.setFilters({});
    }

    if (screen === "artifacts") {
      this.artifactsScreen = this.caller.artifacts
        ? new ArtifactsScreen({ caller: { artifacts: this.caller.artifacts } })
        : null;
      await this.artifactsScreen?.load();
    }

    if (screen === "routing-rules") {
      const routingCaller = this.caller.routing;
      if (routingCaller) {
        this.routingRulesScreen = new RoutingRulesScreen({
          caller: { routing: routingCaller },
          projectId: null,
        });
        await this.routingRulesScreen.load();
      } else {
        this.routingRulesScreen = null;
      }
    }

    if (screen === "planning") {
      if (this.caller.planning) {
        this.planningScreen = new PlanningBreakdownScreen({
          caller: {
            planning: this.caller.planning,
            workflows: this.caller.workflows?.runAcceptanceCycle
              ? { runAcceptanceCycle: this.caller.workflows.runAcceptanceCycle }
              : undefined,
          },
          input: this.planningInput,
          freeformInput: this.freeformPlanningInput,
          freeformStartInput: this.freeformStartInput,
          guidedAcpInput: this.guidedAcpInput,
          continuousUpdateInput: this.continuousUpdateInput,
          technicalPlanningInput: this.technicalPlanningInput,
          workflowCycleInput: this.workflowCycleInput,
        });
        await this.planningScreen.load();
      } else {
        this.planningScreen = null;
      }
    }

    await this._renderCurrentScreen();
  }

  private async _loadDomainRows(screen: DomainScreen): Promise<void> {
    this.domainRows = [];
    this.domainError = null;
    this.taskListScreen?.dispose();
    this.taskListScreen = null;
    try {
      if (screen === "tasks" && this.caller.tasks) {
        this.taskListScreen = new TaskListScreen({
          caller: {
            tasks: {
              list: async () => (await this.caller.tasks!.list()).map(toTuiTask),
              bulk: this.caller.tasks.bulk,
              previewDependencyRun: this.caller.tasks.previewDependencyRun,
              dispatchDependencyRun: this.caller.tasks.dispatchDependencyRun,
              dependencyRunLiveFeedback: this.caller.tasks.dependencyRunLiveFeedback,
              dependencyRunLiveFeedbackStream: this.caller.tasks.dependencyRunLiveFeedbackStream,
              recordQaReview: this.caller.tasks.recordQaReview,
              manualWorkbench: this.caller.tasks.manualWorkbench,
            },
          },
          subscriptions: this.caller.tasksSubscriptions,
        });
        await this.taskListScreen.load();
        return;
      }

      if (screen === "runs" && this.caller.agent_runs) {
        const runs = await this.caller.agent_runs.list();
        this.domainRows = runs.map((run) => `${run.id}  ${run.agent}  ${run.status}  ${run.taskTitle ?? ""}`);
        this.runsScreen = new RunsScreen({ caller: { agent_runs: this.caller.agent_runs } });
        await this.runsScreen.load();
        const firstRun = runs[0];
        if (firstRun) {
          this.runDetailScreen?.dispose();
          this.runDetailScreen = new RunDetailScreen({
            runId: firstRun.id,
            caller: { agent_runs: this.caller.agent_runs },
            subscriptions: this.caller.runsSubscriptions,
          });
          await this.runDetailScreen.load();
        }
        return;
      }

      const rows = await this._listDomainRows(screen);
      this.domainRows = rows.map(formatDomainRow);
    } catch (error) {
      this.domainError = error instanceof Error ? error.message : String(error);
    }
  }

  private async _listDomainRows(screen: DomainScreen): Promise<unknown[]> {
    if (screen === "projects") return await this.caller.projects?.list() ?? [];
    if (screen === "tasks") return await this.caller.tasks?.list() ?? [];
    if (screen === "sprints") return await this.caller.sprints?.list() ?? [];
    if (screen === "repos") return await this.caller.repos?.list() ?? [];
    if (screen === "memory") return await this.caller.memories?.list({}) ?? [];
    if (screen === "search") return await this.caller.search?.query({ q: "", limit: 10 }) ?? [];
    if (screen === "docs") return [];
    if (screen === "skills") return [];
    if (screen === "components") return [];
    if (screen === "doctor") return [];
    return [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Headless helpers (for tests)
  // ─────────────────────────────────────────────────────────────────────────

  /** Navigate to a screen directly (for tests — bypasses keyboard). */
  async navigateTo(screen: TuiScreen): Promise<void> {
    await this._navigate(screen);
  }

  async renderForTest(): Promise<void> {
    await this._renderCurrentScreen();
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
  container: import("@platform-core/interface/runtime-container.ts").DiContainer | null = null,
): Promise<TuiCaller> {
  const caller = await createTuiLocalCaller({
    container,
    userAgent: "fulcrum-tui",
  });
  const publicApiCaller = withWorkflowApiCaller(
    withWebhookApiCaller(
      withAuditApiCaller(
        withNotificationApiCaller(
          withAgentRunApiCaller(caller as unknown as TuiCaller),
        ),
      ),
    ),
  );
  return enrichTuiCaller(publicApiCaller as unknown as TuiCaller);
}

export async function buildTelemetrySink(
  container: import("@platform-core/interface/runtime-container.ts").DiContainer | null = null,
): Promise<TuiTelemetrySink> {
  try {
    const { em, session } = await requireTuiSessionContext({
      container,
      userAgent: "fulcrum-tui",
    });
    if (!em) return new NullTelemetrySink();
    const orgId = session.activeOrganizationId ?? session.orgId;
    return new DbTelemetrySink({
      em,
      org: orgId as never,
      user: session.userId as never,
    });
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

function enrichTuiCaller(caller: TuiCaller): TuiCaller {
  return {
    ...caller,
    flags: caller.flags,
    tasks: caller.tasks,
    inference: caller.inference,
    docs: caller.docs,
    routing: caller.routing,
    planning: caller.planning,
    auth: {
      whoami: async () => {
        const whoami = await caller.auth.whoami();
        const flags = await caller.flags.list().catch(() => []);
        const saasAuthEnabled = flags.some((flag) => flag.name === "saas-auth" && flag.enabled);

        return {
          ...whoami,
          orgName: whoami.orgName ?? whoami.orgId,
          passkeyCount: whoami.passkeyCount ?? 0,
          saasAuthEnabled,
          authProviders: whoami.authProviders ?? (saasAuthEnabled ? authProvidersFromEnv() : []),
        };
      },
    },
  };
}

function tuiNotifyCaller(notify: NonNullable<TuiCaller["notify"]>) {
  return {
    ...notify,
    mute: (input: { sourceKind: string; sourceId: string }) =>
      notify.mute?.({ subjectKind: input.sourceKind, subjectId: input.sourceId } as never) ?? Promise.resolve({ ok: false }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// launchTui — convenience launcher used by the `fulcrum tui` binary entry.
// Constructs a TuiApp, mounts it, and returns the running instance.
// Headless tests inject FakeTTY for both output + input.
// ─────────────────────────────────────────────────────────────────────────────

export async function launchTui(opts: TuiAppOptions): Promise<TuiApp> {
  if (!opts.output) {
    const openTuiRenderer = await createFulcrumTuiRenderer({ testMode: false });
    const app = new TuiApp({
      ...opts,
      output: new OpenTuiOutput(openTuiRenderer),
      openTuiRenderer,
    });
    await app.mount();
    return app;
  }

  const app = new TuiApp(opts);
  await app.mount();
  return app;
}

class OpenTuiOutput implements TuiOutput {
  private buffer = "";

  readonly isTTY = true;
  readonly columns = process.stdout.columns ?? 120;
  readonly rows = process.stdout.rows ?? 32;

  constructor(private readonly adapter: FulcrumTuiRenderer) {}

  write(data: string): void {
    if (data.includes("\x1b[2J\x1b[H")) this.buffer = "";
    this.buffer += data;
    this.adapter.render(this.buffer);
  }
}

function isDomainScreen(screen: TuiScreen): screen is DomainScreen {
  return [
    "projects",
    "tasks",
    "sprints",
    "docs",
    "memory",
    "runs",
    "repos",
    "search",
    "skills",
    "components",
    "doctor",
  ].includes(screen);
}

function domainTitle(screen: DomainScreen): string {
  const titles: Record<DomainScreen, string> = {
    projects: "Projects",
    tasks: "Tasks",
    sprints: "Sprints",
    docs: "Docs",
    memory: "Memory",
    runs: "Runs",
    repos: "Repos",
    search: "Search",
    skills: "Skills",
    components: "Components",
    doctor: "Doctor/Settings",
  };
  return titles[screen];
}

function formatDomainRow(row: unknown): string {
  if (!row || typeof row !== "object") return String(row);
  const record = row as Record<string, unknown>;
  const primary = record["name"] ?? record["title"] ?? record["slug"] ?? record["id"] ?? "item";
  const status = record["status"] ? `  [${String(record["status"])}]` : "";
  const id = record["id"] && record["id"] !== primary ? `  ${String(record["id"])}` : "";
  return `${String(primary)}${status}${id}`;
}

function toTuiTask(row: {
  id: string;
  title?: string;
  status?: string;
  assigneeId?: string | null;
  assignee?: string | null;
  labels?: string[] | null;
}): TuiTask {
  return {
    id: row.id,
    title: row.title ?? row.id,
    status: row.status ?? "pending",
    assignee: row.assignee ?? row.assigneeId ?? null,
    labels: row.labels ?? [],
  };
}
