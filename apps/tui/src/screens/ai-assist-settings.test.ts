import { describe, expect, test } from "bun:test";
import { resolveAiAssistSettings } from "@platform-core/application/settings/ai-assist-resolver.ts";
import { renderAiAssistSettingsScreen } from "./ai-assist-settings.ts";

describe("renderAiAssistSettingsScreen", () => {
	test("surfaces effective values and tier sources", () => {
		const resolved = resolveAiAssistSettings({
			user: { checkpointMode: "git", retentionDays: 14 },
			org: { eventsTransport: "db-outbox" },
		});
		const text = renderAiAssistSettingsScreen({ resolved, scope: "user", userId: "u1" });
		expect(text).toContain("AI Assist");
		expect(text).toContain("checkpointMode   git");
		expect(text).toContain("(user)");
		expect(text).toContain("eventsTransport  db-outbox");
		expect(text).toContain("(org)");
		expect(text).toContain("user=u1");
	});

	test("falls through to defaults when nothing set", () => {
		const resolved = resolveAiAssistSettings({});
		const text = renderAiAssistSettingsScreen({ resolved, scope: "org", userId: null });
		expect(text).toContain("(default)");
		expect(text).toContain("retentionCount   20");
	});
});
