/**
 * TUI presenter for /settings ai-assist tab.
 *
 * Pure function that renders an effective resolution view + scoped form
 * stub. Wired into the TUI settings palette as `:settings ai-assist`.
 */

import type {
	AiAssistSettings,
	ResolvedAiAssistSettings,
	SettingSource,
} from "@platform-core/application/settings/ai-assist-resolver.ts";
import { flattenResolved } from "@platform-core/application/settings/ai-assist-resolver.ts";

export interface AiAssistSettingsScreenInput {
	resolved: ResolvedAiAssistSettings;
	scope: "user" | "org";
	userId: string | null;
}

function badge(source: SettingSource): string {
	switch (source) {
		case "session":
			return "(session)";
		case "user":
			return "(user)";
		case "org":
			return "(org)";
		default:
			return "(default)";
	}
}

export function renderAiAssistSettingsScreen(input: AiAssistSettingsScreenInput): string {
	const r = input.resolved;
	const flat: AiAssistSettings = flattenResolved(r);
	const lines: string[] = [];
	lines.push("═══ Settings / AI Assist ═══");
	lines.push("");
	lines.push(`  scope: ${input.scope}${input.userId ? ` (user=${input.userId})` : ""}`);
	lines.push("");
	lines.push("  Effective resolution");
	lines.push(`    checkpointMode   ${r.checkpointMode.value.padEnd(10)} ${badge(r.checkpointMode.source)}`);
	lines.push(`    retentionCount   ${String(r.retentionCount.value).padEnd(10)} ${badge(r.retentionCount.source)}`);
	lines.push(`    retentionDays    ${String(r.retentionDays.value).padEnd(10)} ${badge(r.retentionDays.source)}`);
	lines.push(`    eventsTransport  ${r.eventsTransport.value.padEnd(10)} ${badge(r.eventsTransport.source)}`);
	lines.push("");
	lines.push("  Flat snapshot");
	lines.push(`    ${JSON.stringify(flat)}`);
	lines.push("");
	lines.push("  :set <key> <value>   — write to current scope");
	lines.push("  :scope user|org      — toggle save scope");
	return lines.join("\n");
}
