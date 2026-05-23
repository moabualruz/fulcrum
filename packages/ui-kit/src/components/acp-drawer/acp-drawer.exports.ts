import type { Snippet } from "svelte";
import { cn } from "../../utils.js";
import { Sheet, SheetContent } from "../sheet/index.js";

/**
 * Where the drawer docks. `right` is the 420px desktop overlay (Cloudflare
 * AI Assistant pattern); `bottom` is the mobile bottom-sheet branch.
 */
export type AcpDrawerSide = "right" | "bottom";

/**
 * A single OD `.drawer-meta` strip cell (`ai-assist.html` lines 55-64,
 * 118-125): label + value pair, e.g. `session run_8f29a4c`.
 */
export type AcpDrawerMetaItem = {
	/** Stable cell id: drives `data-meta-id` for design-e2e. */
	id: string;
	/** Plain label (`session`, `step`, `policy`, `cost`, `tokens`, `cache`, `elapsed`). */
	label: string;
	/** Bold value rendered after the label. */
	value: string;
};

/**
 * One row of the agent-picker full panel (IA-MAP.md §5): a configured CLI
 * agent with health + topology counts.
 */
export type AcpDrawerAgentRow = {
	/** Stable agent id: drives `data-agent-id`. */
	id: string;
	/** Agent display name. */
	name: string;
	/** Client kind metadata (`claude-code` · `codex` · `gemini-cli` · …). */
	client: string;
	/** Status text (`Ready`, `Paused`, `Offline`). */
	status: string;
	/** Status-dot tone: drives `data-status-tone`. */
	tone?: "ready" | "paused" | "offline";
	/** Round-trip latency string (`0.8s`, `n/a`). */
	latency: string;
	/** Connected MCP server count. */
	mcp: number;
	/** Installed plugin count. */
	plugins: number;
	/** Routing-ring badge label (`executor`, `validator`, `planner`) or null. */
	ring?: string | null;
};

export type AcpDrawerProps = {
	/** Controlled open state: drives `data-open` on the drawer surface. */
	open?: boolean;
	side?: AcpDrawerSide;
	/** Drawer header title (AI Assist). */
	title?: string;
	/** Optional Step-scope subtitle (`Step 3/8 · AUTH-43`). */
	scopeLabel?: string;
	/** Selected agent label shown on the picker control. */
	agentLabel?: string;
	/** Agent registry rows; when non-empty the picker opens the full panel. */
	agents?: AcpDrawerAgentRow[];
	/** OD `.drawer-meta` strip cells (session · step · policy · cost · tokens · cache · elapsed). */
	meta?: AcpDrawerMetaItem[];
	/** Header trace slot: consumer passes a `<TraceChip badge />` (CONTEXT.md: TraceBadge in AcpDrawer header). */
	trace?: Snippet;
	/** Live thread body slot. */
	children?: Snippet;
	/** Composer / send-row slot. */
	composer?: Snippet;
	onOpenChange?: (open: boolean) => void;
	/** Agent-picker selection callback (agent id). */
	onAgentSelect?: (agentId: string) => void;
	/** Expand action: widens the drawer for protocol detail (`ai-assist.html`). */
	onExpand?: () => void;
	/** Save-thread → reusable prompt template snapshot (`ai-assist.html` line 89). */
	onSaveThread?: () => void;
	class?: string;
};
