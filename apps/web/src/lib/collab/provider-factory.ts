/**
 * createCollabProvider — returns MockCollabProvider when flag OFF or in test env,
 * and a HocuspocusProvider adapter when flag ON.
 *
 * Real Hocuspocus is imported dynamically so it is NEVER bundled when flag is OFF.
 */
import type { CollabProvider, CollabUser, CursorState, PresenceState } from "./types.js";
import { isCollabEnabled, isWebRTCFallbackEnabled } from "./feature-flags.js";
import { MockCollabProvider } from "./mock-provider.js";

export interface ProviderOptions {
	docId: string;
	user: CollabUser;
	/** Override FULCRUM_FEATURES for testing */
	featuresEnv?: string;
	/** Override Hocuspocus URL (defaults to VITE_FULCRUM_HOCUSPOCUS_URL) */
	hocuspocusUrl?: string;
}

export class CollabProviderConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CollabProviderConfigError";
	}
}

export class CollabProviderDependencyError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "CollabProviderDependencyError";
	}
}

export async function createCollabProvider(options: ProviderOptions): Promise<CollabProvider> {
	const { docId, user, featuresEnv, hocuspocusUrl } = options;

	if (!isCollabEnabled(featuresEnv)) {
		// Flag OFF — return a disconnected mock that is never connected
		return new MockCollabProvider();
	}

	if (isWebRTCFallbackEnabled(featuresEnv)) {
		// WebRTC P2P fallback — no Hocuspocus server required
		return createWebRTCProvider(docId, user);
	}

	// Flag ON — dynamic import so Hocuspocus is tree-shaken when OFF
	const url = resolveHocuspocusUrl(hocuspocusUrl);
	try {
		const providerModule = "@hocuspocus/provider";
		const yjsModule = "yjs";
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { HocuspocusProvider } = await import(/* @vite-ignore */ providerModule as any);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { Doc } = await import(/* @vite-ignore */ yjsModule as any);
		const doc = new Doc();

		return new HocuspocusAdapterProvider(
			new HocuspocusProvider({ url, name: docId, document: doc }),
			doc,
			user,
		);
	} catch (error) {
		throw new CollabProviderDependencyError(
			"real-time-collab-server requires @hocuspocus/provider and yjs",
			{ cause: error },
		);
	}
}

export function resolveHocuspocusUrl(explicitUrl?: string): string {
	if (explicitUrl) return explicitUrl;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const envUrl = typeof import.meta !== "undefined" ? (import.meta as any).env?.VITE_FULCRUM_HOCUSPOCUS_URL : undefined;
	if (envUrl) return envUrl;
	if (typeof window !== "undefined" && window.location?.host) {
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		return `${protocol}//${window.location.host}/yjs`;
	}
	throw new CollabProviderConfigError(
		"real-time-collab-server requires VITE_FULCRUM_HOCUSPOCUS_URL outside browser runtime",
	);
}

// ---- WebRTC fallback provider ------------------------------------------------

function createWebRTCProvider(docId: string, user: CollabUser): CollabProvider {
	// Same mock-based structure; real impl would use y-webrtc dynamic import
	console.warn("[collab] WebRTC P2P fallback — using mock provider (y-webrtc not installed)");
	const mock = new MockCollabProvider();
	mock.setUser(user);
	return mock;
}

// ---- Hocuspocus adapter -------------------------------------------------------

/** Thin adapter so Hocuspocus conforms to CollabProvider interface. */
class HocuspocusAdapterProvider implements CollabProvider {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(private hp: any, readonly document: unknown, private user: CollabUser) {}

	get connected(): boolean {
		return this.hp.isConnected?.() ?? false;
	}

	connect(): void {
		this.hp.connect?.();
	}

	disconnect(): void {
		this.hp.disconnect?.();
	}

	setUser(user: CollabUser): void {
		this.user = user;
		this.hp.setAwarenessField?.("user", user);
	}

	onPresenceChange(cb: (state: PresenceState) => void): () => void {
		const handler = () => {
			const states: CollabUser[] = [];
			this.hp.awareness?.getStates?.().forEach((s: { user?: CollabUser }) => {
				if (s.user) states.push(s.user);
			});
			cb({ users: states });
		};
		this.hp.awareness?.on("change", handler);
		return () => this.hp.awareness?.off("change", handler);
	}

	onCursorChange(cb: (cursors: CursorState[]) => void): () => void {
		const handler = () => {
			const cursors: CursorState[] = [];
			this.hp.awareness?.getStates?.().forEach((s: { user?: CollabUser; cursor?: { anchor: number; head: number } }, id: string) => {
				if (s.user && s.cursor) {
					cursors.push({ userId: id, user: s.user, anchor: s.cursor.anchor, head: s.cursor.head });
				}
			});
			cb(cursors);
		};
		this.hp.awareness?.on("change", handler);
		return () => this.hp.awareness?.off("change", handler);
	}

	updateCursor(anchor: number, head: number): void {
		this.hp.awareness?.setLocalStateField?.("cursor", { anchor, head });
	}
}
