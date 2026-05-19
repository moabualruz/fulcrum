/**
 * Three-tier resolver for AI Assist session settings.
 *
 * Resolution order:
 *   1. per-session override (e.g. column on AcpSession)
 *   2. user preference (per-user stored value)
 *   3. org default (TenantSetting)
 *   4. built-in default
 *
 * Pure function — pass values from the appropriate store; no I/O here.
 */

export type CheckpointModeSetting = "auto" | "git" | "file" | "none";
export type EventsTransportSetting = "memory" | "db-outbox" | "external";

export interface AiAssistSettings {
	checkpointMode: CheckpointModeSetting;
	retentionCount: number;
	retentionDays: number;
	eventsTransport: EventsTransportSetting;
}

export const AI_ASSIST_DEFAULTS: AiAssistSettings = {
	checkpointMode: "auto",
	retentionCount: 20,
	retentionDays: 30,
	eventsTransport: "memory",
};

export type AiAssistSettingKey = keyof AiAssistSettings;

export type SettingSource = "session" | "user" | "org" | "default";

export interface ResolvedSetting<T> {
	value: T;
	source: SettingSource;
}

export interface AiAssistSettingInputs {
	session?: Partial<AiAssistSettings> | null;
	user?: Partial<AiAssistSettings> | null;
	org?: Partial<AiAssistSettings> | null;
}

const VALID_MODES: ReadonlySet<CheckpointModeSetting> = new Set([
	"auto",
	"git",
	"file",
	"none",
]);

const VALID_TRANSPORTS: ReadonlySet<EventsTransportSetting> = new Set([
	"memory",
	"db-outbox",
	"external",
]);

function normaliseMode(raw: unknown): CheckpointModeSetting | undefined {
	if (typeof raw !== "string") return undefined;
	const lower = raw.toLowerCase().trim();
	return VALID_MODES.has(lower as CheckpointModeSetting)
		? (lower as CheckpointModeSetting)
		: undefined;
}

function normaliseTransport(raw: unknown): EventsTransportSetting | undefined {
	if (typeof raw !== "string") return undefined;
	const lower = raw.toLowerCase().trim();
	return VALID_TRANSPORTS.has(lower as EventsTransportSetting)
		? (lower as EventsTransportSetting)
		: undefined;
}

function normaliseInt(raw: unknown, min: number, max: number): number | undefined {
	const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
	if (!Number.isFinite(n) || Number.isNaN(n)) return undefined;
	const v = Math.trunc(n);
	if (v < min || v > max) return undefined;
	return v;
}

function pickKey<T>(
	key: AiAssistSettingKey,
	inputs: AiAssistSettingInputs,
	normalise: (raw: unknown) => T | undefined,
	fallback: T,
): ResolvedSetting<T> {
	const tiers: Array<{ src: SettingSource; bag: Partial<AiAssistSettings> | null | undefined }> = [
		{ src: "session", bag: inputs.session },
		{ src: "user", bag: inputs.user },
		{ src: "org", bag: inputs.org },
	];
	for (const tier of tiers) {
		if (!tier.bag) continue;
		const raw = tier.bag[key];
		const candidate = normalise(raw as unknown);
		if (candidate !== undefined) return { value: candidate, source: tier.src };
	}
	return { value: fallback, source: "default" };
}

export interface ResolvedAiAssistSettings {
	checkpointMode: ResolvedSetting<CheckpointModeSetting>;
	retentionCount: ResolvedSetting<number>;
	retentionDays: ResolvedSetting<number>;
	eventsTransport: ResolvedSetting<EventsTransportSetting>;
}

export function resolveAiAssistSettings(
	inputs: AiAssistSettingInputs,
): ResolvedAiAssistSettings {
	return {
		checkpointMode: pickKey(
			"checkpointMode",
			inputs,
			normaliseMode,
			AI_ASSIST_DEFAULTS.checkpointMode,
		),
		retentionCount: pickKey(
			"retentionCount",
			inputs,
			(raw) => normaliseInt(raw, 1, 10_000),
			AI_ASSIST_DEFAULTS.retentionCount,
		),
		retentionDays: pickKey(
			"retentionDays",
			inputs,
			(raw) => normaliseInt(raw, 1, 3650),
			AI_ASSIST_DEFAULTS.retentionDays,
		),
		eventsTransport: pickKey(
			"eventsTransport",
			inputs,
			normaliseTransport,
			AI_ASSIST_DEFAULTS.eventsTransport,
		),
	};
}

export function resolveSessionSetting<K extends AiAssistSettingKey>(
	orgId: string,
	userId: string,
	sessionId: string,
	key: K,
	inputs: AiAssistSettingInputs = {},
): ResolvedAiAssistSettings[K] {
	void orgId;
	void userId;
	void sessionId;
	return resolveAiAssistSettings(inputs)[key];
}

/** Convenience: flatten ResolvedAiAssistSettings to AiAssistSettings. */
export function flattenResolved(resolved: ResolvedAiAssistSettings): AiAssistSettings {
	return {
		checkpointMode: resolved.checkpointMode.value,
		retentionCount: resolved.retentionCount.value,
		retentionDays: resolved.retentionDays.value,
		eventsTransport: resolved.eventsTransport.value,
	};
}
