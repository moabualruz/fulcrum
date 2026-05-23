<script lang="ts">
	/**
	 * Review workbench: `/review/<reviewId>`, the production surface for OD
	 * `review.html` (`prd-web-review-workbench-od-fidelity`).
	 *
	 * The canonical IA-MAP §2.4 home is `/<ws>/projects/<projId>/review/<reviewId>`;
	 * this `/review/<reviewId>` folder is the rendered production review-workbench
	 * route the Review queue (`/review`) links into and the StageRail resolves
	 * under the Review WorkflowStage.
	 *
	 * The OD ships the **Review workbench**: the single dense surface where an
	 * operator inspects one PR and records a decision. The OD `.rev-shell` (lines
	 * 13–23) is a four-region CSS grid:
	 *
	 *  - **head**: breadcrumb, PR title, the `waiting-input` decision badge, a
	 *    trace pill, and the Re-run checks / Comment / `Approve & merge ⌘↵`
	 *    decision actions;
	 *  - **tabs**: Files / Comments / Free chat / Plan & tasks / Commits, plus a
	 *    trailing split/unified Diff-view toggle;
	 *  - **tree | diff | notes**: a folder-grouped file tree, the inline diff
	 *    pane, and the right-hand annotations rail;
	 *  - **tree | dock | notes**: the bottom Checks/Summary/Logs/Suggestions dock
	 *    with a gate readout.
	 *
	 * The inline diff is `DESIGN.md` §4.6: split/unified toggle, per-hunk
	 * accept/reject, line numbers always on, commentable lines with a hover
	 * affordance and anchored threads. Per-hunk keyboard is `DESIGN.md` §4.5
	 * tool-call cards: `a` accept / `r` reject / `h` next-hunk. The decision
	 * header carries the `Mod+Enter` approve / send-feedback overload (`IA-MAP.md`
	 * §4.4 Plannotator): with zero annotations it approves, with annotations it
	 * sends feedback.
	 *
	 * Migration (`design-alignment/review.md` §review.html migration notes):
	 *  - `comments-block-thread` is absorbed as the ui-kit `CommentThread`
	 *    primitive: selection-anchored, resolvable, faded-when-resolved threads
	 *    (`DESIGN.md` §9.1). The standalone route is retired to a redirect.
	 *  - `review-templates` becomes the Comments-panel composer template picker;
	 *    its five built-in templates become composer affordances. The standalone
	 *    route is retired to a redirect.
	 *
	 * Status vocabulary is the canonical `COPY.md` §362 8-state set: the
	 * `waiting-input` decision badge is canonical. Every UI primitive is composed
	 * from `@fulcrum/ui-kit` per the AGENTS.md ui-kit rule; the `waiting-input`
	 * badge resolves through `StatusBadge`, the trace identity through `TraceChip`.
	 */
	import { page } from "$app/state";
	import { Button, CommentThread, Kbd } from "@fulcrum/ui-kit";
	import {
		Badge, Select, StatusBadge, TraceChip, type CommentThreadState, type ThreadComment, type WorkflowStatus } from "@fulcrum/ui-kit";
	import { cn } from "@fulcrum/ui-kit";

	/* ── Route identity ──────────────────────────────────────────────────── */

	/** The review id from the `[reviewId]` route segment (OD PR `#4218`). */
	const reviewId = $derived(page.params.reviewId ?? "4218");

	/* ── Workbench tabs (OD `rev-tabs` lines 301–309) ───────────────────────── */

	type WorkbenchTab = "files" | "comments" | "chat" | "plan" | "commits";

	interface TabDef {
		id: WorkbenchTab;
		/** OD tab label, verbatim from `review.html`. */
		label: string;
		/** Optional count pill (OD `.count`). */
		count?: number;
	}

		const WORKBENCH_TABS: readonly TabDef[] = [
			{ id: "files", label: "Files", count: 7 },
			{ id: "comments", label: "Comments", count: 6 },
			{ id: "chat", label: "AI Assist", count: 2 },
			{ id: "plan", label: "Plan & tasks" },
			{ id: "commits", label: "Commits", count: 17 },
		] as const;

	/* ── File tree (OD `.tree` lines 312–329) ───────────────────────────────── */

	interface TreeFile {
		/** File name (OD `.name`). */
		name: string;
		/** Insertions count (OD `.add`). */
		add: number;
		/** Deletions count (OD `.del`). */
		del: number;
		/** Open comment count on the file (OD `.com` chip), if any. */
		comments?: number;
	}

	interface TreeFolder {
		/** Folder path label (OD `.folder`). */
		label: string;
		files: readonly TreeFile[];
	}

	const TREE: readonly TreeFolder[] = [
		{
			label: "src/auth",
			files: [
				{ name: "session.ts", add: 12, del: 1, comments: 2 },
				{ name: "verify.ts", add: 18, del: 4, comments: 1 },
				{ name: "issuance.repo.ts", add: 24, del: 0, comments: 1 },
				{ name: "revoke.handler.ts", add: 31, del: 0 },
			],
		},
		{
			label: "db/migrations",
			files: [{ name: "0042_sessions_kid.sql", add: 22, del: 0 }],
		},
		{
			label: "src/limit",
			files: [{ name: "per-kid.ts", add: 14, del: 6 }],
		},
		{
			label: "telemetry",
			files: [{ name: "auth.events.ts", add: 9, del: 1, comments: 1 }],
		},
	] as const;

	/* ── Inline diff (OD `.diff-pane` / `.file-block` lines 332–440) ────────── */

	type DiffLineKind = "ctx" | "add" | "del";

	interface DiffLine {
		kind: DiffLineKind;
		/** Line number in the new file (OD `.n`). */
		n: number;
		text: string;
		/** Whether the line accepts an inline comment (OD `.commentable`). */
		commentable?: boolean;
		/** Open-thread id anchored to this line (OD `comment-mark` / `margin-pin`). */
		thread?: string;
	}

	interface DiffHunk {
		/** Hunk header (OD `.hunk-head`: `@@ -42,7 +42,12 @@`). */
		header: string;
		lines: readonly DiffLine[];
	}

	interface DiffFile {
		name: string;
		add: number;
		del: number;
		hunks: readonly DiffHunk[];
		/** Optional safe-migration badge (OD `migration safe · doctor ✓`). */
		safeBadge?: string;
	}

	const DIFF_FILES: readonly DiffFile[] = [
		{
			name: "src/auth/session.ts",
			add: 12,
			del: 1,
			hunks: [
				{
					header: "@@ -42,7 +42,12 @@ session.ts",
					lines: [
						{ kind: "ctx", n: 42, text: "export function newSession(req: Req) {", commentable: true },
						{ kind: "del", n: 43, text: "  const t = signToken(req.user);" },
						{ kind: "add", n: 43, text: "  const kid = uuid();", commentable: true },
						{
							kind: "add",
							n: 44,
							text: "  const t = signToken(req.user, { rotate: true, kid });",
							commentable: true,
						},
						{
							kind: "add",
							n: 45,
							text: "  await issuance.record({ kid, userId: req.user.id, ip: req.ip });",
							commentable: true,
						},
						{
							kind: "add",
							n: 46,
							text: "  return { token: t.jwt, exp: t.exp, kid };",
							commentable: true,
							thread: "session-ts-46",
						},
						{ kind: "ctx", n: 47, text: "}" },
					],
				},
			],
		},
		{
			name: "src/auth/verify.ts",
			add: 18,
			del: 4,
			hunks: [
				{
					header: "@@ -10,12 +10,26 @@ verify.ts",
					lines: [
						{ kind: "ctx", n: 10, text: "export async function verifyToken(jwt: string) {", commentable: true },
						{ kind: "ctx", n: 11, text: "  const claims = decodeJwt(jwt);", commentable: true },
						{ kind: "del", n: 12, text: "  if (!claims.userId) return null;" },
						{ kind: "add", n: 12, text: "  if (!claims.userId) return null;", commentable: true },
						{ kind: "add", n: 13, text: "  if (claims.kid) {", commentable: true },
						{ kind: "add", n: 14, text: "    const row = await issuance.findByKid(claims.kid);", commentable: true },
						{ kind: "add", n: 15, text: "    if (!row || row.revokedAt) return null;", commentable: true },
						{ kind: "add", n: 16, text: "    return { userId: claims.userId, kid: claims.kid };", commentable: true },
						{ kind: "add", n: 17, text: "  }", commentable: true, thread: "verify-ts-17" },
						{ kind: "ctx", n: 18, text: "  return verifyLegacy(claims); // sunset 2026-06-01" },
					],
				},
			],
		},
		{
			name: "db/migrations/0042_sessions_kid.sql",
			add: 22,
			del: 0,
			safeBadge: "migration safe · doctor ✓",
			hunks: [
				{
					header: "@@ +1,22 @@ 0042_sessions_kid.sql",
					lines: [
						{ kind: "add", n: 1, text: "CREATE TABLE session_issuance (" },
						{ kind: "add", n: 2, text: "  kid          uuid PRIMARY KEY," },
						{ kind: "add", n: 3, text: "  user_id      uuid NOT NULL REFERENCES users(id)," },
						{ kind: "add", n: 4, text: "  issued_at    timestamptz NOT NULL DEFAULT now()," },
						{ kind: "add", n: 5, text: "  revoked_at   timestamptz NULL" },
						{ kind: "add", n: 6, text: ");" },
						{ kind: "add", n: 7, text: "CREATE INDEX session_issuance_user_id_idx ON session_issuance (user_id);" },
					],
				},
			],
		},
	] as const;

	/* ── Inline diff threads (OD `annot-row` lines 355–371, 400–411) ───────── */

	interface InlineThread {
		anchorLabel: string;
		anchorChip: string;
		quote: string;
		state: CommentThreadState;
		comments: ThreadComment[];
	}

	const INLINE_THREADS: Record<string, InlineThread> = {
		"session-ts-46": {
			anchorLabel: "src/auth/session.ts · L46",
			anchorChip: "session.ts:46",
			quote: "return { token: t.jwt, exp: t.exp, kid };",
			state: "open",
			comments: [
				{
					id: "c1",
					author: "Jamie Black",
					context: "sec-review",
					ts: "2m",
					body: "Should the response really return the kid? Clients shouldn't need it: handing it back leaks revocation surface. Keep it server-only and expose a dedicated session endpoint instead.",
				},
			],
		},
		"verify-ts-17": {
			anchorLabel: "src/auth/verify.ts · L17",
			anchorChip: "verify.ts:17",
			quote: "  }",
			state: "resolved",
			comments: [
				{
					id: "c1",
					author: "Priya Shah",
					ts: "15m",
					body: "If both the claims.kid path and legacy verify can succeed, reject: picking one silently is the bug we'll chase for a quarter.",
				},
			],
		},
	};

	/* ── Comments panel: anchored threads (OD lines 443–518) ───────────────── */

	const COMMENT_PANEL_THREADS: readonly (InlineThread & { id: string })[] = [
		{
			id: "pr-description",
			anchorLabel: "PR description · summary block",
			anchorChip: "pr#4218",
			quote: "",
			state: "open",
			comments: [
				{
					id: "c1",
					author: "Jordan Tate",
					ts: "just now",
					body: "Description should call out that this is migration-safe and list the support incidents. Reviewers will skim and want that up top.",
				},
			],
		},
		{
			id: "session-ts-46",
			anchorLabel: "src/auth/session.ts · L46",
			anchorChip: "session.ts:46",
			quote: "return { token: t.jwt, exp: t.exp, kid };",
			state: "open",
			comments: [
				{
					id: "c1",
					author: "Jamie Black",
					context: "sec-review",
					ts: "2m",
					body: "Returning kid leaks revocation surface. Keep server-only or expose a dedicated /sessions/me endpoint.",
				},
			],
		},
		{
			id: "issuance-repo",
			anchorLabel: "src/auth/issuance.repo.ts · summary",
			anchorChip: "issuance.repo.ts",
			quote: "",
			state: "open",
			comments: [
				{
					id: "c1",
					author: "claude-opus-4.7",
					kind: "agent",
					context: "self-review",
					ts: "7m",
					body: "Added kid-keyed issuance table. No back-reference index on userId yet: the 'list my sessions' query will scan. I can add an index in a follow-up if you confirm cardinality is high enough.",
				},
			],
		},
		{
			id: "telemetry",
			anchorLabel: "telemetry/auth.events.ts · schema",
			anchorChip: "auth.events.ts",
			quote: "",
			state: "failed-save",
			comments: [
				{
					id: "c1",
					author: "Priya Shah",
					ts: "22m",
					body: "Contract test fails: emits kid but the registered schema expects tokenId. Either rename the schema or rename the field.",
				},
				{
					id: "c2",
					author: "claude-opus-4.7",
					kind: "agent",
					ts: "21m",
					body: "Recommend renaming the schema (3 lines) over renaming the field (28 call sites). Want me to open a follow-up PR?",
				},
			],
		},
	] as const;

	/* ── Bottom dock (OD `.dock` lines 584–624) ─────────────────────────────── */

	type DockTab = "checks" | "summary" | "logs" | "suggestions";

	interface DockTabDef {
		id: DockTab;
		label: string;
		count?: number;
	}

	const DOCK_TABS: readonly DockTabDef[] = [
		{ id: "checks", label: "Checks", count: 5 },
		{ id: "summary", label: "Summary" },
		{ id: "logs", label: "Logs" },
		{ id: "suggestions", label: "Suggestions", count: 2 },
	] as const;

	type CheckTone = "ok" | "fail" | "run";

	interface DockCheck {
		name: string;
		tone: CheckTone;
		detail: string;
	}

	const DOCK_CHECKS: readonly DockCheck[] = [
		{ name: "ci / unit (auth)", tone: "ok", detail: "passed · 1m 24s" },
		{ name: "ci / lint (eslint · semgrep)", tone: "ok", detail: "passed · 42s" },
		{ name: "ci / e2e (login → revoke)", tone: "run", detail: "running · 12% · ~3m left" },
		{ name: "ci / contract (auth.session.issued)", tone: "fail", detail: "failing · schema mismatch" },
		{ name: "doctor / migrations dry-run", tone: "ok", detail: "passed · 8s" },
	] as const;

	const DOCK_SUGGESTIONS: readonly { anchor: string; text: string }[] = [
		{ anchor: "verify.ts:17 → reject-on-both", text: "Make the legacy + kid path mutually exclusive." },
		{ anchor: "auth.events.ts:14 → rename schema", text: "Resolve the contract failure by renaming the registered field." },
	] as const;

	/* ── Notes / annotations rail (OD `.notes` lines 627–686) ───────────────── */

	interface NoteCard {
		id: string;
		author: string;
		kind: ThreadComment["kind"];
		ts: string;
		where: string;
		quote?: string;
		text: string;
		unresolved: boolean;
	}

	const NOTE_CARDS: readonly NoteCard[] = [
		{
			id: "n1",
			author: "Jamie Black",
			kind: "human",
			ts: "2m ago",
			where: "session.ts · L46",
			quote: "return { token: t.jwt, exp: t.exp, kid };",
			text: "Returning kid leaks revocation surface. Keep server-only or expose a dedicated /sessions/me endpoint.",
			unresolved: true,
		},
		{
			id: "n2",
			author: "You",
			kind: "you",
			ts: "just now",
			where: "verify.ts · L18: sunset",
			text: "Calendar reminder set for 2026-06-01 to drop verifyLegacy. Added to operate/doctor as a future-deprecation row.",
			unresolved: false,
		},
		{
			id: "n3",
			author: "claude-opus-4.7 · agent",
			kind: "agent",
			ts: "7m ago",
			where: "issuance.repo.ts · summary",
			text: "Added kid-keyed issuance table. No back-reference index on userId yet: the 'list my sessions' query will scan.",
			unresolved: true,
		},
	] as const;

	/* ── Composer template picker: absorbed `review-templates` (OD §template) ─ */

	/**
	 * The five built-in review-comment templates, absorbed from the retired
	 * `review-templates` route per `design-alignment/review.md`. They become the
	 * Comments-panel composer template picker: selecting one seeds the composer
	 * body. No feature loss: the template library is now a workbench affordance.
	 */
	const COMMENT_TEMPLATES: readonly { id: string; label: string; body: string }[] = [
		{ id: "missing-criteria", label: "Missing acceptance criteria", body: "This change omits acceptance criteria. Add an explicit pass/fail signal." },
		{ id: "stale-context", label: "Stale context", body: "This reference no longer matches reality. Point it at the current source." },
		{ id: "prototype-mismatch", label: "Prototype mismatch", body: "Implementation diverges from the prototype here. Reconcile the difference." },
		{ id: "test-gap", label: "Test gap", body: "This behavior lacks coverage; add a test before merge." },
		{ id: "code-risk", label: "Code risk", body: "This introduces a risk (perf / data / security). Mitigation required before merge." },
	] as const;

	/* ── Reactive state ─────────────────────────────────────────────────────── */

	let activeTab = $state<WorkbenchTab>("files");
	let activeDockTab = $state<DockTab>("checks");
	/** Diff render mode: split (two-pane) or unified, OD Diff-view toggle. */
	let diffMode = $state<"unified" | "split">("unified");
	/** The active file in the tree (OD `aria-current`). */
	let activeFile = $state<string>("session.ts");
	/** Per-hunk accept/reject decisions, keyed `<file>::<header>`. */
	let hunkDecisions = $state<Record<string, "accepted" | "rejected">>({});
	/** The diff line index the per-hunk keyboard cursor is on. */
	let cursorHunk = $state(0);
	/** Comment-panel composer body: seeded by the template picker. */
	let composerBody = $state("");
	/** The decision the workbench has recorded, once acted on. */
	let decision = $state<"none" | "approved" | "feedback-sent">("none");

	/**
	 * Whether the PR has unresolved annotations. The `Mod+Enter` overload
	 * (`IA-MAP.md` §4.4): with annotations present it sends feedback; with none
	 * it approves and merges.
	 */
	const hasAnnotations = $derived(NOTE_CARDS.some((note) => note.unresolved));

	/** The canonical decision-gate status: OD `waiting-input` badge. */
	const decisionStatus: WorkflowStatus = "waiting-input";

	/** Flat ordered list of every hunk for the per-hunk keyboard cursor. */
	const allHunks = $derived(
		DIFF_FILES.flatMap((file) => file.hunks.map((hunk) => ({ file: file.name, header: hunk.header }))),
	);

	/** A stable per-hunk decision key. */
	function hunkKey(file: string, header: string): string {
		return `${file}::${header}`;
	}

	/** Accept the hunk under the keyboard cursor (OD §4.5 `a`). */
	function acceptHunk(index: number): void {
		const hunk = allHunks[index];
		if (!hunk) return;
		hunkDecisions = { ...hunkDecisions, [hunkKey(hunk.file, hunk.header)]: "accepted" };
	}

	/** Reject the hunk under the keyboard cursor (OD §4.5 `r`). */
	function rejectHunk(index: number): void {
		const hunk = allHunks[index];
		if (!hunk) return;
		hunkDecisions = { ...hunkDecisions, [hunkKey(hunk.file, hunk.header)]: "rejected" };
	}

	/** Advance the per-hunk cursor to the next hunk (OD §4.5 `h`). */
	function nextHunk(): void {
		if (allHunks.length === 0) return;
		cursorHunk = (cursorHunk + 1) % allHunks.length;
	}

	/**
	 * Record the review decision. `Mod+Enter` overload (`IA-MAP.md` §4.4): if the
	 * PR has unresolved annotations the action sends feedback; otherwise it
	 * approves and merges.
	 */
	function recordDecision(): void {
		decision = hasAnnotations ? "feedback-sent" : "approved";
	}

	/**
	 * Window keyboard handler for the workbench:
	 *  - `Mod+Enter` → record the decision (approve / send-feedback overload);
	 *  - `a` / `r` / `h` → per-hunk accept / reject / next-hunk (`DESIGN.md` §4.5),
	 *    only when the diff tab is active and focus is not in a text field.
	 */
	function onKeydown(event: KeyboardEvent): void {
		const target = event.target as HTMLElement | null;
		const inField =
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLInputElement ||
			target?.isContentEditable === true;

		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			recordDecision();
			return;
		}
		if (inField || activeTab !== "files") return;
		if (event.key === "a") {
			event.preventDefault();
			acceptHunk(cursorHunk);
		} else if (event.key === "r") {
			event.preventDefault();
			rejectHunk(cursorHunk);
		} else if (event.key === "h") {
			event.preventDefault();
			nextHunk();
		}
	}

	/** Two-letter monogram from an author name (OD `.av`). */
	function monogram(name: string): string {
		if (name.toLowerCase().startsWith("you")) return "mk";
		return name
			.replace(/·.*$/, "")
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0] ?? "")
			.join("")
			.toUpperCase();
	}

	/** Seed the composer body from a template (absorbed `review-templates`). */
	function applyTemplate(event: Event): void {
		const id = (event.target as HTMLSelectElement).value;
		const template = COMMENT_TEMPLATES.find((t) => t.id === id);
		if (template) composerBody = template.body;
	}
</script>

<svelte:head>
	<title>Review · PR #{reviewId}</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<main
	class="grid h-[calc(100vh-3rem)] min-h-0 grid-cols-[260px_1fr_340px] grid-rows-[auto_auto_1fr_220px] bg-background text-foreground"
	style="grid-template-areas: 'head head head' 'tabs tabs tabs' 'tree diff notes' 'tree dock notes';"
	data-review-workbench
	data-review-id={reviewId}
	data-decision={decision}
>
	<!-- ── HEAD: breadcrumb, title, waiting-input badge, trace pill, actions ── -->
	<header
		class="flex items-center gap-3 border-b border-border bg-card px-5 py-3.5"
		style="grid-area: head;"
		data-review-head
	>
		<nav
			class="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
			data-review-breadcrumb
			aria-label="Review breadcrumb"
		>
			<span>review</span><span class="text-border">›</span>
			<span>#{reviewId}</span><span class="text-border">›</span>
			<strong class="text-foreground">auth/rewrite</strong>
		</nav>
		<h1 class="flex flex-1 items-center gap-2.5 text-lg font-semibold tracking-tight" data-review-title>
			feat(auth): rotate session token per device
			<StatusBadge status={decisionStatus} data-review-decision-badge />
			<span class="font-mono text-xs font-normal text-muted-foreground" data-review-reviewers-needed>
				2 reviewers needed
			</span>
		</h1>
		<span class="flex items-center gap-2 font-mono text-xs text-muted-foreground" data-review-meta>
			<span>17 commits</span><span class="text-border">·</span><span>7 files</span>
		</span>
		<TraceChip traceId="8f29a4c1b3e0d5f7a2c4e6b8" data-review-trace />
		<Button variant="secondary" size="sm" data-review-action="rerun">Re-run checks</Button>
		<Button variant="secondary" size="sm" data-review-action="comment">Comment</Button>
		<Button size="sm" data-review-action="approve" onclick={recordDecision}>
			Approve &amp; merge
			<Kbd class="ml-1.5">⌘↵</Kbd>
		</Button>
	</header>

	<!-- ── TABS: Files / Comments / Free chat / Plan & tasks / Commits ──────── -->
	<div
		class="flex items-center border-b border-border bg-card px-2"
		style="grid-area: tabs;"
		role="tablist"
		aria-label="Review workbench panels"
		data-review-tabs
	>
		{#each WORKBENCH_TABS as tab (tab.id)}
			{@const active = tab.id === activeTab}
			<button
				type="button"
				role="tab"
				id={`review-tab-${tab.id}`}
				aria-selected={active}
				aria-controls={`review-panel-${tab.id}`}
				tabindex={active ? 0 : -1}
				data-review-tab={tab.id}
				data-active={active ? "true" : undefined}
				class={cn(
					"flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs transition-colors",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
					active
						? "border-primary font-medium text-primary"
						: "border-transparent text-muted-foreground hover:text-foreground",
				)}
				onclick={() => (activeTab = tab.id)}
			>
				{tab.label}
				{#if tab.count !== undefined}
					<span class="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
						{tab.count}
					</span>
				{/if}
			</button>
		{/each}
		<span class="flex-1"></span>
		<!-- Diff-view split/unified toggle: OD trailing `Diff view` tab. -->
		<button
			type="button"
			data-review-diff-toggle
			data-diff-mode={diffMode}
			class="flex items-center gap-1.5 px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
			onclick={() => (diffMode = diffMode === "unified" ? "split" : "unified")}
		>
			Diff view: {diffMode}
		</button>
	</div>

	<!-- ── TREE: folder-grouped file tree ──────────────────────────────────── -->
	<aside
		class="overflow-y-auto border-r border-border bg-muted/30 text-xs"
		style="grid-area: tree;"
		data-review-tree
	>
		<div
			class="sticky top-0 flex items-center gap-2 border-b border-border bg-card px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
		>
			Files · 7
		</div>
		{#each TREE as folder (folder.label)}
			<div
				class="flex items-center gap-1.5 px-2.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
				data-review-tree-folder={folder.label}
			>
				{folder.label}
			</div>
			{#each folder.files as file (file.name)}
				{@const current = file.name === activeFile}
				<button
					type="button"
					data-review-tree-file={file.name}
					aria-current={current ? "true" : undefined}
					class={cn(
						"grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-1.5 px-2.5 py-1 text-left font-mono",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
						current ? "bg-accent/15 text-accent-foreground" : "hover:bg-muted",
					)}
					onclick={() => (activeFile = file.name)}
				>
					<span class="truncate">{file.name}</span>
					{#if file.comments}
						<span class="text-[10px] text-accent-foreground" data-review-tree-comments={file.name}>
							💬{file.comments}
						</span>
					{:else}
						<span></span>
					{/if}
					<span class="text-[10px] text-success">+{file.add}</span>
					<span class="text-[10px] text-destructive">−{file.del}</span>
				</button>
			{/each}
		{/each}
	</aside>

	<!-- ── DIFF / panel body ────────────────────────────────────────────────── -->
	<section
		class="min-w-0 overflow-auto p-4"
		style="grid-area: diff;"
		data-review-body
		data-review-active-panel={activeTab}
	>
		{#if activeTab === "files"}
			<div
				id="review-panel-files"
				role="tabpanel"
				aria-labelledby="review-tab-files"
				data-review-panel="files"
				data-diff-mode={diffMode}
			>
				{#each DIFF_FILES as file (file.name)}
					<article class="mb-5 rounded-md border border-border" data-review-diff-file={file.name}>
						<!-- Sticky file head: OD `.file-head` with View raw / Mark viewed. -->
						<header
							class="flex items-center gap-2.5 rounded-t-md border-b border-border bg-card px-3.5 py-2.5 font-mono text-xs"
						>
							<span class="font-semibold text-foreground">{file.name}</span>
							<span class="text-success">+{file.add}</span>
							<span class="text-destructive">−{file.del}</span>
							<span class="flex-1"></span>
							{#if file.safeBadge}
								<Badge variant="outline" data-review-file-safe={file.name}>{file.safeBadge}</Badge>
							{:else}
								<Button variant="ghost" size="sm" data-review-file-raw={file.name}>View raw</Button>
								<Button variant="ghost" size="sm" data-review-file-viewed={file.name}>
									Mark viewed
								</Button>
							{/if}
						</header>
						{#each file.hunks as hunk (hunk.header)}
							{@const key = hunkKey(file.name, hunk.header)}
							{@const verdict = hunkDecisions[key]}
							{@const cursorOn = allHunks[cursorHunk]?.file === file.name && allHunks[cursorHunk]?.header === hunk.header}
							<div data-review-hunk={hunk.header} data-hunk-verdict={verdict ?? "pending"}>
								<!-- Hunk head: OD `.hunk-head` with Suggest / Comment + accept/reject. -->
								<div
									class={cn(
										"flex items-center gap-2 border-b border-border bg-muted/40 px-3.5 py-1.5 font-mono text-[11px] text-muted-foreground",
										cursorOn && "ring-1 ring-inset ring-accent/50",
									)}
									data-review-hunk-head={hunk.header}
									data-hunk-cursor={cursorOn ? "true" : undefined}
								>
									<span>{hunk.header}</span>
									<span class="flex-1"></span>
									<Button
										variant="ghost"
										size="sm"
										data-review-hunk-accept={hunk.header}
										onclick={() => {
											hunkDecisions = { ...hunkDecisions, [key]: "accepted" };
										}}
									>
										Accept <Kbd class="ml-1">a</Kbd>
									</Button>
									<Button
										variant="ghost"
										size="sm"
										data-review-hunk-reject={hunk.header}
										onclick={() => {
											hunkDecisions = { ...hunkDecisions, [key]: "rejected" };
										}}
									>
										Reject <Kbd class="ml-1">r</Kbd>
									</Button>
								</div>
								<!-- Diff lines: line numbers always on; commentable lines + threads. -->
								<div
									class={cn(
										"font-mono text-[12px]",
										diffMode === "split" && "grid grid-cols-2 divide-x divide-border",
									)}
									data-review-hunk-lines={hunk.header}
								>
									{#each hunk.lines as line (`${line.kind}-${line.n}-${line.text}`)}
										<div
											data-review-diff-line={line.n}
											data-line-kind={line.kind}
											data-line-commentable={line.commentable ? "true" : undefined}
											class={cn(
												"flex items-start gap-2 px-2 py-px",
												line.kind === "add" && "bg-success/10",
												line.kind === "del" && "bg-destructive/10",
												line.commentable && "cursor-pointer hover:bg-accent/10",
											)}
										>
											<span class="w-9 shrink-0 select-none text-right text-muted-foreground">
												{line.n}
											</span>
											<span class="w-3 shrink-0 select-none text-muted-foreground">
												{line.kind === "add" ? "+" : line.kind === "del" ? "−" : ""}
											</span>
											<span class="whitespace-pre-wrap break-all">{line.text}</span>
											{#if line.thread}
												<span
													data-review-line-thread-mark={line.thread}
													class="ml-auto rounded-full border border-accent bg-accent/15 px-1.5 text-[10px] font-bold text-accent-foreground"
												>
													💬
												</span>
											{/if}
										</div>
										{#if line.thread && INLINE_THREADS[line.thread]}
											{@const th = INLINE_THREADS[line.thread]}
											<!-- Inline annotation thread: OD `annot-row` via ui-kit CommentThread. -->
											<CommentThread
												threadId={line.thread}
												anchorLabel={th.anchorLabel}
												anchorChip={th.anchorChip}
												quote={th.quote}
												comments={th.comments}
												threadState={th.state}
												data-review-inline-thread={line.thread}
												class={cn("mx-2 my-1.5", diffMode === "split" && "col-span-2")}
											>
												<Button variant="ghost" size="sm" data-review-thread-reply={line.thread}>
													Reply
												</Button>
												{#if th.state !== "resolved"}
													<Button variant="ghost" size="sm" data-review-thread-resolve={line.thread}>
														Resolve
													</Button>
													<Button variant="ghost" size="sm" data-review-thread-patch={line.thread}>
														Patch with AI
													</Button>
												{/if}
											</CommentThread>
										{/if}
									{/each}
								</div>
							</div>
						{/each}
					</article>
				{/each}
			</div>
		{:else if activeTab === "comments"}
			<div
				id="review-panel-comments"
				role="tabpanel"
				aria-labelledby="review-tab-comments"
				data-review-panel="comments"
				class="flex flex-col gap-3"
			>
				<!-- Composer template picker: absorbed `review-templates` route. -->
				<div
					class="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
					data-review-composer
				>
					<label class="flex items-center gap-2 text-xs text-muted-foreground">
						Template
						<select
							data-review-template-picker
							class="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
							onchange={applyTemplate}
						>
							<option value="">- pick a template -</option>
							{#each COMMENT_TEMPLATES as template (template.id)}
								<option value={template.id}>{template.label}</option>
							{/each}
						</select>
					</label>
					<textarea
						data-review-composer-body
						bind:value={composerBody}
						rows="2"
						placeholder="Comment on this PR: pick a template above or write your own…"
						aria-label="PR comment composer"
						class="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
					></textarea>
				</div>
				{#each COMMENT_PANEL_THREADS as thread (thread.id)}
					<CommentThread
						threadId={thread.id}
						anchorLabel={thread.anchorLabel}
						anchorChip={thread.anchorChip}
						quote={thread.quote || undefined}
						comments={thread.comments}
						threadState={thread.state}
						data-review-comment-thread={thread.id}
					>
						<Button variant="ghost" size="sm">Reply</Button>
						{#if thread.state === "failed-save"}
							<Button variant="ghost" size="sm" data-review-thread-retry={thread.id}>Retry</Button>
						{:else}
							<Button variant="ghost" size="sm">Resolve</Button>
						{/if}
					</CommentThread>
				{/each}
			</div>
		{:else if activeTab === "chat"}
			<div
				id="review-panel-chat"
				role="tabpanel"
				aria-labelledby="review-tab-chat"
				data-review-panel="chat"
				class="flex flex-col gap-3 text-sm"
			>
					<p class="text-xs text-muted-foreground">
						AI Assist thread with PR reviewers: @ to mention.
					</p>
					<CommentThread
						threadId="ai-assist-thread"
						anchorLabel="AI Assist · auth/rewrite"
					comments={[
						{ id: "fc1", author: "Jamie Black", ts: "14m", body: "Pulling this in. Do we have rollback steps documented?" },
						{ id: "fc2", author: "You", kind: "you", ts: "12m", body: "Feature flag auth.rotate_kid in operate/doctor. Default off." },
						{ id: "fc3", author: "claude-opus-4.7", kind: "agent", ts: "8m", body: "Runbook section docs/runbook/auth.md#kid-rollback added." },
					]}
					threadState="open"
				>
					<Button variant="ghost" size="sm">Mention</Button>
					<Button variant="ghost" size="sm">Ask AI</Button>
				</CommentThread>
			</div>
		{:else if activeTab === "plan"}
			<div
				id="review-panel-plan"
				role="tabpanel"
				aria-labelledby="review-tab-plan"
				data-review-panel="plan"
				class="flex flex-col gap-2 text-sm"
			>
				<h2 class="text-sm font-semibold">Plan · auth-rewrite: tasks 6 / 8</h2>
				<p class="text-xs text-muted-foreground">Promoted from plan-review on 13:02.</p>
				<ul class="flex flex-col gap-1.5 font-mono text-xs">
					<li class="flex items-center gap-2 rounded-md border border-border px-3 py-2">
						<StatusBadge status="completed" /> Add kid + rotate flag
					</li>
					<li class="flex items-center gap-2 rounded-md border border-border px-3 py-2">
						<StatusBadge status="completed" /> verifyToken dual-verify
					</li>
					<li class="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2">
						<StatusBadge status="blocked" /> Telemetry events + dashboard: contract mismatch
					</li>
					<li class="flex items-center gap-2 rounded-md border border-border px-3 py-2">
						<StatusBadge status="running" /> Settings UI · sessions list
					</li>
				</ul>
			</div>
		{:else if activeTab === "commits"}
			<div
				id="review-panel-commits"
				role="tabpanel"
				aria-labelledby="review-tab-commits"
				data-review-panel="commits"
				class="flex flex-col gap-1.5 font-mono text-xs"
			>
				<h2 class="font-sans text-sm font-semibold">17 commits on auth/rewrite</h2>
				<div class="flex gap-2.5 border-b border-border/60 py-1.5">
					<span class="text-success">●</span><span class="text-muted-foreground">9c3a1f1</span>
					<span>chore(auth): add doctor row for legacy verify sunset</span>
				</div>
				<div class="flex gap-2.5 border-b border-border/60 py-1.5">
					<span class="text-success">●</span><span class="text-muted-foreground">e8b2d77</span>
					<span>fix(auth): handle nullable revokedAt in verifyToken</span>
				</div>
				<div class="flex gap-2.5 py-1.5">
					<span class="text-success">●</span><span class="text-muted-foreground">…</span>
					<span>15 more</span>
				</div>
			</div>
		{/if}
	</section>

	<!-- ── DOCK: Checks / Summary / Logs / Suggestions + gate readout ───────── -->
	<section
		class="flex min-h-0 flex-col border-r border-t border-border bg-card"
		style="grid-area: dock;"
		data-review-dock
	>
		<div class="flex items-center border-b border-border px-2" role="tablist" aria-label="Review dock">
			{#each DOCK_TABS as tab (tab.id)}
				{@const active = tab.id === activeDockTab}
				<button
					type="button"
					role="tab"
					aria-selected={active}
					data-review-dock-tab={tab.id}
					data-active={active ? "true" : undefined}
					class={cn(
						"flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs transition-colors",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
						active
							? "border-primary font-medium text-primary"
							: "border-transparent text-muted-foreground hover:text-foreground",
					)}
					onclick={() => (activeDockTab = tab.id)}
				>
					{tab.label}
					{#if tab.count !== undefined}
						<span class="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
							{tab.count}
						</span>
					{/if}
				</button>
			{/each}
			<span class="flex-1"></span>
			<!-- Gate readout: OD `.gate` `1 / 2 approvals · 0 blocking`. -->
			<span class="px-3 py-1 text-xs text-muted-foreground" data-review-gate>
				<b class="text-foreground">1 / 2</b> approvals · <b class="text-foreground">1</b> blocking
			</span>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 text-sm">
			{#if activeDockTab === "checks"}
				<div data-review-dock-panel="checks" class="flex flex-col">
					{#each DOCK_CHECKS as check (check.name)}
						<div
							class="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-border/60 py-2 font-mono text-xs last:border-b-0"
							data-review-check={check.name}
							data-check-tone={check.tone}
						>
							<span class="flex items-center gap-2 text-foreground">
								<span
									class={cn(
										check.tone === "ok" && "text-success",
										check.tone === "fail" && "text-destructive",
										check.tone === "run" && "text-accent-foreground",
									)}
								>
									{check.tone === "ok" ? "✓" : check.tone === "fail" ? "✕" : "◐"}
								</span>
								{check.name}
							</span>
							<span class="text-muted-foreground">{check.detail}</span>
						</div>
					{/each}
				</div>
			{:else if activeDockTab === "summary"}
				<div data-review-dock-panel="summary" class="flex flex-col gap-2 text-xs">
					<p class="text-sm">7 files · +130 / −12 · 17 commits · 4 reviewers requested.</p>
					<p class="text-muted-foreground">
						Plan: auth-rewrite · Run: run_8f29a4c · Trace: tr_8f29a4c…
					</p>
				</div>
			{:else if activeDockTab === "logs"}
				<pre
					data-review-dock-panel="logs"
					class="m-0 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground"
				>$ doctor probe auth
[OK]  jwt_kid_index: present
[OK]  issuance.row count: 14
[WARN] legacy_token still verifies for 14 days
[OK]  rate_limit per-kid: wired</pre>
			{:else if activeDockTab === "suggestions"}
				<div data-review-dock-panel="suggestions" class="flex flex-col gap-2">
					{#each DOCK_SUGGESTIONS as suggestion (suggestion.anchor)}
						<div class="rounded-md border border-border bg-background p-2.5" data-review-suggestion>
							<div class="mb-1 font-mono text-[11px] text-muted-foreground">{suggestion.anchor}</div>
							<div class="text-sm">{suggestion.text}</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<!-- ── NOTES: right-hand annotations rail ──────────────────────────────── -->
	<aside
		class="flex flex-col overflow-y-auto border-l border-border bg-background"
		style="grid-area: notes;"
		data-review-notes
	>
		<div
			class="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
		>
			Annotations · {NOTE_CARDS.length}
			<span class="flex-1"></span>
			<Button variant="ghost" size="sm" data-review-notes-filter>Filter</Button>
			<Button variant="ghost" size="sm" data-review-notes-add>Note</Button>
		</div>
		<div class="flex flex-1 flex-col">
			{#each NOTE_CARDS as note (note.id)}
				<article
					data-review-note={note.id}
					data-note-unresolved={note.unresolved ? "true" : "false"}
					class={cn(
						"flex flex-col gap-1.5 border-b border-border px-3.5 py-3 text-sm",
						note.unresolved && "border-l-2 border-l-warning bg-warning/5",
						!note.unresolved && "opacity-65",
					)}
				>
					<div class="flex items-center gap-2">
						<span
							aria-hidden="true"
							class={cn(
								"flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-primary-foreground",
								note.kind === "agent" && "bg-success",
								note.kind === "you" && "bg-primary",
								note.kind === "human" && "bg-accent",
							)}
						>
							{note.kind === "agent" ? "AI" : monogram(note.author)}
						</span>
						<span class="font-semibold">{note.author}</span>
						<span class="ml-auto font-mono text-[10px] text-muted-foreground">{note.ts}</span>
					</div>
					<div class="font-mono text-[10px] text-muted-foreground">{note.where}</div>
					{#if note.quote}
						<div
							class="rounded-sm border border-border bg-muted/60 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
						>
							{note.quote}
						</div>
					{/if}
					<p class="leading-relaxed text-foreground">{note.text}</p>
				</article>
			{/each}
		</div>
		<div class="flex items-start gap-2 border-t border-border bg-card px-3.5 py-2.5">
			<span
				aria-hidden="true"
				class="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
			>
				mk
			</span>
			<textarea
				data-review-notes-composer
				rows="2"
				placeholder="Leave a note on this PR or quote a line first…"
				aria-label="Add a note"
				class="flex-1 resize-y rounded-sm border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
			></textarea>
		</div>
	</aside>

	<!-- Decision readout: surfaces the recorded Mod+Enter overload outcome. -->
	{#if decision !== "none"}
		<p class="sr-only" role="status" data-review-decision-result={decision}>
			{decision === "approved"
				? "Approved and merged: no annotations were outstanding."
				: "Feedback sent: the PR has unresolved annotations."}
		</p>
	{/if}
</main>
