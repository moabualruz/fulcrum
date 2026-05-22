import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type TraceChipProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
	/** Full trace identifier. The DESIGN.md §4.10 badge surfaces an 8-char hex prefix. */
	traceId: string;
	href?: string;
	/** Truncate to the §4.10 8-char hex prefix + ellipsis. `false` shows the full id. */
	short?: boolean;
	copyable?: boolean;
	/**
	 * Render the DESIGN.md §4.10 TraceBadge treatment: `trace:` prefix,
	 * 24px height, surface-sunken background, hover tooltip + right-click menu.
	 * `false` keeps the legacy compact ◷ pill.
	 */
	badge?: boolean;
	/** Tooltip + menu context (§4.10: full id + project + cycle + timestamp). */
	project?: string;
	cycle?: string;
	timestamp?: string;
	onCopy?: (traceId: string) => void;
	/** Right-click "Open in audit" target (§4.10). */
	onOpenAudit?: (traceId: string) => void;
	/** Right-click "Open in CLI": writes `fulcrum trace show <id>` to clipboard (§4.10). */
	onOpenCli?: (traceId: string) => void;
};
