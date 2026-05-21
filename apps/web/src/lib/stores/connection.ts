/**
 * Shell connection-state store.
 *
 * This is the keeper logic absorbed from the former standalone
 * `cross-cutting-offline` route: an `offline | syncing | online` state machine
 * plus the locally-queued mutation list. It now lives in the shell so a single
 * connection banner in `+layout.svelte` can drive the offline experience for
 * every route: instead of the old `offline` route doing a hard
 * `window.location.href` reconnect-redirect, which is not the OD pattern
 * (`design-alignment/cross-states.md` §error.html migration notes).
 *
 * The offline + queued-mutation behavior is an offline-class error: it follows
 * the COPY.md §3 "Offline + queued mutation" template verbatim: "You're
 * offline. This change is queued and will sync when you reconnect." with a
 * "View queued changes" affordance: and never the banned "Please try again" /
 * "Something went wrong" copy.
 *
 * Trace continuity (DESIGN.md §13 invariant 1): going offline never navigates
 * away, so the active trace surfaced by the shell `TraceFooter` survives the
 * connection drop. Queued mutations replay in order on reconnect.
 */

import { derived, get, writable } from "svelte/store";

/** The three connection states (the absorbed `cross-cutting-offline` machine). */
export type ConnectionState = "offline" | "syncing" | "online";

/** A mutation captured locally while offline, replayed in order on reconnect. */
export interface QueuedMutation {
	/** tRPC-style mutation kind, e.g. `task.update`. */
	readonly kind: string;
	/** Human-readable summary of what the operator changed. */
	readonly summary: string;
}

/** Current connection state. Starts `online`; `initConnectionMonitor` corrects it. */
export const connectionState = writable<ConnectionState>("online");

/** Mutations queued locally while offline, in submit order. */
export const queuedMutations = writable<readonly QueuedMutation[]>([]);

/** `true` only while the connection state is `offline`. */
export const isOffline = derived(connectionState, ($state) => $state === "offline");

/** `true` while there is at least one mutation waiting to sync. */
export const hasQueuedMutations = derived(
	queuedMutations,
	($queued) => $queued.length > 0,
);

/**
 * `true` when the shell connection banner should be shown: offline (queued
 * work pending) or actively syncing. `online` with an empty queue is the
 * steady state and shows nothing.
 */
export const showConnectionBanner = derived(
	[connectionState, queuedMutations],
	([$state, $queued]) => $state !== "online" || $queued.length > 0,
);

/**
 * Record a mutation that could not reach the API because the operator is
 * offline. The caller stays on its current surface; the shell banner reflects
 * the queued count. No-op semantics are fine to call repeatedly.
 */
export function enqueueMutation(mutation: QueuedMutation): void {
	queuedMutations.update((queue) => [...queue, mutation]);
}

/** Mark the connection lost. Idempotent. */
export function markOffline(): void {
	connectionState.set("offline");
}

/**
 * Mark the connection restored. If mutations are queued, transition through
 * `syncing` and replay them; once the queue drains the state settles `online`.
 * With no queued work it goes straight to `online`.
 */
export function markOnline(): void {
	if (get(queuedMutations).length > 0) {
		connectionState.set("syncing");
	} else {
		connectionState.set("online");
	}
}

/**
 * Drain the queued mutations: the reconnect replay completing. Clears the
 * queue and settles the state `online`. Real replay wiring lands with the
 * mutation-retry layer; this models the contract the banner depends on.
 */
export function completeSync(): void {
	queuedMutations.set([]);
	connectionState.set("online");
}

/**
 * Wire the store to the browser connectivity signals. Reads `navigator.onLine`
 * once on mount, then tracks `online` / `offline` window events. Returns a
 * teardown function for `onMount`. Safe to call when `window` is undefined
 * (SSR): it becomes a no-op returning a no-op teardown.
 */
export function initConnectionMonitor(): () => void {
	if (typeof window === "undefined" || typeof navigator === "undefined") {
		return () => {};
	}

	if (!navigator.onLine) {
		markOffline();
	}

	const handleOffline = (): void => markOffline();
	const handleOnline = (): void => markOnline();

	window.addEventListener("offline", handleOffline);
	window.addEventListener("online", handleOnline);

	return () => {
		window.removeEventListener("offline", handleOffline);
		window.removeEventListener("online", handleOnline);
	};
}
