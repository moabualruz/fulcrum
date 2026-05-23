import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

/**
 * Authorship of a comment: a human reviewer or an AI agent. DESIGN.md §9.1
 * + OD `review.html` `av agent` / `claude-opus-4.7` authorship: agent comments
 * carry a distinct avatar treatment so reviewer vs agent voice is legible at a
 * glance. `you` is the current operator (OD `av you`).
 */
export type CommentAuthorKind = "human" | "agent" | "you";

/** A single comment inside a thread (OD `annot-row .comment`). */
export interface ThreadComment {
	/** Stable id: the `data-comment-thread-comment` hook + keyed-each key. */
	id: string;
	/** Display name (OD `.meta strong`). */
	author: string;
	/** Comment body text (OD `.text`). */
	body: string;
	/** Relative timestamp (OD `.meta span`: `2m`, `just now`). */
	ts: string;
	/** Author kind: selects the avatar treatment. Defaults to `human`. */
	kind?: CommentAuthorKind;
	/** Optional context label after the name (OD `· sec-review` / `· agent`). */
	context?: string;
}

/**
 * The visible state of a comment thread: DESIGN.md §9.1 comment-thread
 * states. The OD diff `comment-mark` (resolved/unresolved), the
 * `comments-block-thread` resolvable/faded markers, and the failed-save /
 * permission-denied recovery states all collapse to this one enum so the
 * design gate can assert each branch.
 *
 *  - `open`       : unresolved, accepting replies (OD `annot-row`);
 *  - `resolved`   : closed, faded but still readable (OD `comment-mark.resolved`);
 *  - `empty`      : anchored but no comments yet (start-thread affordance);
 *  - `failed-save`: a reply failed to persist; retry affordance shown;
 *  - `permission` : the viewer may read but not reply.
 */
export type CommentThreadState =
	| "open"
	| "resolved"
	| "empty"
	| "failed-save"
	| "permission";

export type CommentThreadProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
	/** Stable thread id: the `data-comment-thread` hook. */
	threadId: string;
	/**
	 * The anchor the thread is attached to: a diff line, a doc block, a PR
	 * region (OD `comment-thread .anchor` / `note-card .where`). Selection text
	 * is shown as a quote when present.
	 */
	anchorLabel: string;
	/** Optional quoted source text (OD `note-card .quote` / anchored code line). */
	quote?: string;
	/** Short anchor chip text (OD `.anchor-chip`: `session.ts:46`). */
	anchorChip?: string;
	/** The comments in the thread (OD `annot-row` comments). */
	comments?: readonly ThreadComment[];
	/** The thread state: drives resolved fade, empty branch, recovery copy. */
	threadState?: CommentThreadState;
	/**
	 * Initial draft reply text seeded into the composer. The composer textarea
	 * owns its draft after mount; this is a one-way seed (e.g. a template).
	 */
	reply?: string;
	/** Show the inline reply composer (suppressed for `resolved`/`permission`). */
	showComposer?: boolean;
};
