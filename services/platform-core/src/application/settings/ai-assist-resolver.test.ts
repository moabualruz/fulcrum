import { describe, expect, test } from "bun:test";
import {
	AI_ASSIST_DEFAULTS,
	flattenResolved,
	resolveAiAssistSettings,
	resolveSessionSetting,
} from "./ai-assist-resolver.ts";

describe("resolveAiAssistSettings", () => {
	test("session override wins for every key", () => {
		const out = resolveAiAssistSettings({
			session: { checkpointMode: "git", retentionCount: 5 },
			user: { checkpointMode: "file" },
			org: { checkpointMode: "none" },
		});
		expect(out.checkpointMode).toEqual({ value: "git", source: "session" });
		expect(out.retentionCount).toEqual({ value: 5, source: "session" });
	});

	test("user beats org when session absent", () => {
		const out = resolveAiAssistSettings({
			user: { retentionDays: 7 },
			org: { retentionDays: 60 },
		});
		expect(out.retentionDays).toEqual({ value: 7, source: "user" });
	});

	test("org applies when session + user absent", () => {
		const out = resolveAiAssistSettings({
			org: { eventsTransport: "db-outbox" },
		});
		expect(out.eventsTransport).toEqual({ value: "db-outbox", source: "org" });
	});

	test("falls through to built-in defaults when nothing set", () => {
		const out = resolveAiAssistSettings({});
		expect(out.checkpointMode).toEqual({ value: "auto", source: "default" });
		expect(out.retentionCount.value).toBe(AI_ASSIST_DEFAULTS.retentionCount);
	});

	test("rejects invalid mode values and falls through", () => {
		const out = resolveAiAssistSettings({
			session: { checkpointMode: "lol" as never },
			user: { checkpointMode: "GIT" as never },
		});
		expect(out.checkpointMode).toEqual({ value: "git", source: "user" });
	});

	test("rejects negative retention counts", () => {
		const out = resolveAiAssistSettings({
			session: { retentionCount: -3 as never },
			user: { retentionCount: 12 },
		});
		expect(out.retentionCount).toEqual({ value: 12, source: "user" });
	});

	test("flattenResolved returns plain values", () => {
		const resolved = resolveAiAssistSettings({
			user: { checkpointMode: "file", retentionDays: 15 },
		});
		const flat = flattenResolved(resolved);
		expect(flat.checkpointMode).toBe("file");
		expect(flat.retentionDays).toBe(15);
		expect(flat.retentionCount).toBe(AI_ASSIST_DEFAULTS.retentionCount);
	});

	test("resolveSessionSetting exposes keyed three-tier resolution", () => {
		const resolved = resolveSessionSetting("org-1", "user-1", "session-1", "eventsTransport", {
			user: { eventsTransport: "external" },
			org: { eventsTransport: "db-outbox" },
		});
		expect(resolved).toEqual({ value: "external", source: "user" });
	});
});
