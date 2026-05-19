import type {
	CheckpointModeInputs,
	CheckpointModeOverride,
	ResolvedCheckpointMode,
} from "./types.ts";

const ALLOWED: ReadonlySet<CheckpointModeOverride> = new Set([
	"auto",
	"git",
	"file",
	"message",
]);

function normalise(raw: string | null | undefined): CheckpointModeOverride | null {
	if (!raw) return null;
	const lower = raw.toLowerCase().trim();
	if (!lower) return null;
	if (ALLOWED.has(lower as CheckpointModeOverride)) {
		return lower as CheckpointModeOverride;
	}
	return null;
}

/**
 * Three-tier mode resolution: per-session override > user preference >
 * org preference > "auto" default. Returns the source so callers can tell
 * the operator where the effective setting came from.
 */
export function resolveCheckpointMode(inputs: CheckpointModeInputs): ResolvedCheckpointMode {
	const session = normalise(inputs.sessionOverride);
	if (session) return { mode: session, source: "session" };
	const user = normalise(inputs.userPreference);
	if (user) return { mode: user, source: "user" };
	const org = normalise(inputs.orgPreference);
	if (org) return { mode: org, source: "org" };
	return { mode: "auto", source: "default" };
}
