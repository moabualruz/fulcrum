import { fail, redirect } from "@sveltejs/kit";
import {
	AI_ASSIST_DEFAULTS,
	flattenResolved,
	resolveAiAssistSettings,
	type AiAssistSettings,
	type ResolvedAiAssistSettings,
} from "@platform-core/application/settings/ai-assist-resolver.ts";
import { createSettingsApiCaller } from "@platform-core/interface/http/settings-api-client.ts";

interface RouteLocals {
	session: unknown;
	orgId?: string;
	userId?: string;
}

interface LoadEvent {
	locals: RouteLocals;
	fetch: typeof fetch;
	request: { headers: { get(name: string): string | null } };
	url: URL;
}

interface ActionEvent extends LoadEvent {
	request: LoadEvent["request"] & { formData(): Promise<FormData> };
}

const ORG_KEY = "ai-assist.org" as const;
const USER_KEY_PREFIX = "ai-assist.user." as const;

type SettingsCaller = ReturnType<typeof createSettingsApiCaller>;

function getBaseUrl(url: URL): string {
	return (
		process.env["FULCRUM_SERVER_URL"] ??
		process.env["FULCRUM_PUBLIC_API_URL"] ??
		`${url.protocol}//${url.host}`
	);
}

function createCaller(event: LoadEvent): SettingsCaller | null {
	const orgId = event.locals.orgId ?? process.env["FULCRUM_ORG_ID"];
	if (!orgId) return null;
	const cookie = event.request.headers.get("cookie") ?? "";
	return createSettingsApiCaller({
		baseUrl: getBaseUrl(event.url),
		orgId,
		userId: event.locals.userId ?? process.env["FULCRUM_USER_ID"],
		fetch: event.fetch,
		headers: cookie ? { cookie } : undefined,
	});
}

function parseStored(raw: unknown): Partial<AiAssistSettings> | null {
	if (!raw) return null;
	const candidate =
		typeof raw === "object" && raw && "value" in raw
			? (raw as { value: unknown }).value
			: raw;
	if (!candidate) return null;
	if (typeof candidate === "object") return candidate as Partial<AiAssistSettings>;
	if (typeof candidate === "string") {
		try {
			return JSON.parse(candidate) as Partial<AiAssistSettings>;
		} catch {
			return null;
		}
	}
	return null;
}

async function loadSettings(
	caller: SettingsCaller | null,
	userId: string | null,
): Promise<ResolvedAiAssistSettings> {
	if (!caller) return resolveAiAssistSettings({});
	const orgRaw = await caller.settings.get({ key: ORG_KEY }).catch(() => null);
	const userRaw = userId
		? await caller.settings.get({ key: `${USER_KEY_PREFIX}${userId}` }).catch(() => null)
		: null;
	return resolveAiAssistSettings({
		org: parseStored(orgRaw),
		user: parseStored(userRaw),
		session: null,
	});
}

function readFormSettings(form: FormData): AiAssistSettings {
	return {
		checkpointMode: (form.get("checkpointMode") as AiAssistSettings["checkpointMode"]) ?? AI_ASSIST_DEFAULTS.checkpointMode,
		retentionCount: Number(form.get("retentionCount") ?? AI_ASSIST_DEFAULTS.retentionCount),
		retentionDays: Number(form.get("retentionDays") ?? AI_ASSIST_DEFAULTS.retentionDays),
		eventsTransport: (form.get("eventsTransport") as AiAssistSettings["eventsTransport"]) ?? AI_ASSIST_DEFAULTS.eventsTransport,
	};
}

export async function load(event: LoadEvent) {
	if (!event.locals.session) throw redirect(302, "/auth/login");
	const caller = createCaller(event);
	const userId = event.locals.userId ?? process.env["FULCRUM_USER_ID"] ?? null;
	const resolved = await loadSettings(caller, userId);
	return {
		resolved,
		settings: flattenResolved(resolved),
		hasCaller: caller !== null,
		userId,
	};
}

export const actions = {
	save: async (event: ActionEvent) => {
		const form = await event.request.formData();
		const scope = (form.get("scope") as "user" | "org") ?? "user";
		const settings = readFormSettings(form);
		const caller = createCaller(event);
		if (!caller) {
			return fail(503, { saveError: "Settings API caller is not configured.", settings, scope });
		}
		const userId = event.locals.userId ?? process.env["FULCRUM_USER_ID"];
		const key =
			scope === "org"
				? ORG_KEY
				: userId
					? `${USER_KEY_PREFIX}${userId}`
					: null;
		if (!key) {
			return fail(400, { saveError: "userId required to save user-scope settings.", settings, scope });
		}
		try {
			await caller.settings.set({ key, value: JSON.stringify(settings) });
			return { saved: true, settings, scope };
		} catch (err) {
			const message = err instanceof Error ? err.message : "Save failed.";
			return fail(500, { saveError: message, settings, scope });
		}
	},
} as const;
