// Feature flag helpers for FULCRUM_FEATURES env var

/** Parse FULCRUM_FEATURES into a Set. Works in both server (process.env) and client (import.meta.env) contexts. */
function parseFeatures(raw: string | undefined): Set<string> {
	if (!raw) return new Set();
	return new Set(
		raw
			.split(",")
			.map((f) => f.trim())
			.filter(Boolean),
	);
}

/** Reads flags from import.meta.env (Vite/SvelteKit) with an optional override for testing. */
export function getFeatureFlags(override?: string): Set<string> {
	// Allow override for tests / SSR
	if (override !== undefined) return parseFeatures(override);
	// Vite replaces import.meta.env.VITE_FULCRUM_FEATURES at build time
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const env = (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_FULCRUM_FEATURES) || "";
	return parseFeatures(env);
}

export function isCollabEnabled(flagsEnv?: string): boolean {
	return getFeatureFlags(flagsEnv).has("real-time-collab-server");
}

export function isWebRTCFallbackEnabled(flagsEnv?: string): boolean {
	const flags = getFeatureFlags(flagsEnv);
	return flags.has("real-time-collab-server") && flags.has("collab-fallback-webrtc");
}
