import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

/**
 * `TraceFooter.svelte` is the route-side data supplier for the OD StatusFooter
 * (DESIGN.md §3.1, IA-MAP.md §3). These tests prove it consumes the
 * `@fulcrum/ui-kit` `StatusFooter` primitive and maps the full operator
 * segment set onto it: it must NOT re-implement footer chrome route-locally.
 */

type TraceFooterProps = {
	traceId?: string | null;
	requestId?: string | null;
	mode?: "compact" | "base" | "comfortable";
	inputMode?: string;
	profile?: string;
	branch?: string;
	runProgress?: string | null;
	agent?: string;
	mcpHealth?: string;
	mcpDegraded?: boolean;
	time?: string;
};

describe("TraceFooter: OD StatusFooter consumer", () => {
	let render: typeof import("svelte/server").render;
	let TraceFooter: Component<TraceFooterProps>;

	beforeAll(async () => {
		({ render } = await import("svelte/server"));
		const mod = (await import("./TraceFooter.svelte")) as {
			default: Component<TraceFooterProps>;
		};
		TraceFooter = mod.default;
	});

	test("renders the ui-kit StatusFooter primitive, not route-local footer chrome", () => {
		const { body } = render(TraceFooter, { props: { traceId: "tr_8f29a4c1" } });
		// The primitive owns the <footer data-slot="status-footer"> chrome.
		expect(body).toMatch(/<footer\b[^>]*data-slot="status-footer"/);
		// data-footer-mode state attribute comes from the primitive.
		expect(body).toMatch(/data-footer-mode="base"/);
		// This component is a thin consumer: it tags the footer for tests.
		expect(body).toContain("data-trace-footer");
	});

	test("default footer height is the 44px base density", () => {
		const { body } = render(TraceFooter, { props: { traceId: "tr_8f29a4c1" } });
		// DESIGN.md §3.1: base 44px → Tailwind h-11.
		expect(body).toMatch(/class="[^"]*\bh-11\b/);
		expect(body).toMatch(/data-footer-mode="base"/);
	});

	test("left cluster carries mode pill, profile, branch, run, agent, MCP segments", () => {
		const { body } = render(TraceFooter, {
			props: {
				traceId: "tr_8f29a4c1",
				inputMode: "NORMAL",
				profile: "PRO",
				branch: "auth/rewrite",
				runProgress: "3/8",
				agent: "claude-opus-4.7",
				mcpHealth: "7/7",
			},
		});
		const segments = body.match(/data-slot="status-footer-segment"/g) ?? [];
		// mode · profile · branch · run · agent · mcp = 6 segments.
		expect(segments).toHaveLength(6);
		expect(body).toMatch(/data-segment-id="mode"/);
		expect(body).toMatch(/data-segment-id="profile"/);
		expect(body).toMatch(/data-segment-id="branch"/);
		expect(body).toMatch(/data-segment-id="run"/);
		expect(body).toMatch(/data-segment-id="agent"/);
		expect(body).toMatch(/data-segment-id="mcp"/);
		// Input mode renders as a pill (DESIGN.md §3.1 mode pill).
		expect(body).toMatch(/data-slot="status-footer-pill"/);
		expect(body).toContain("NORMAL");
		expect(body).toContain("auth/rewrite");
		expect(body).toContain("run 3/8");
		expect(body).toContain("agent: claude-opus-4.7");
		expect(body).toContain("mcp 7/7");
	});

	test("omits the run segment when no run is active", () => {
		const { body } = render(TraceFooter, {
			props: { traceId: "tr_8f29a4c1", runProgress: null },
		});
		const segments = body.match(/data-slot="status-footer-segment"/g) ?? [];
		expect(segments).toHaveLength(5);
		expect(body).not.toMatch(/data-segment-id="run"/);
	});

	test("right cluster carries the shared TraceBadge, time, help, and palette", () => {
		const { body } = render(TraceFooter, {
			props: { traceId: "tr_8f29a4c1", time: "14:02" },
		});
		expect(body).toMatch(/data-slot="status-footer-right"/);
		// Trace uses the shared DESIGN.md §4.10 TraceBadge (trace-chip badge variant).
		expect(body).toMatch(/data-slot="trace-chip"[^>]*data-variant="badge"/);
		expect(body).toContain("data-trace-footer-id");
		expect(body).toContain("trace:");
		// Time segment.
		expect(body).toContain("data-trace-footer-time");
		expect(body).toContain("14:02");
		// Help + palette right-side controls.
		expect(body).toMatch(/data-trace-footer-help[^>]*aria-label="Keyboard shortcuts · \?"/);
		expect(body).toMatch(/data-trace-footer-palette[^>]*aria-label="Command palette · ⌘K"/);
	});

	test("right-most segment is the keyboard-accessible AI Assist trigger with ⌘/ hint", () => {
		const { body } = render(TraceFooter, { props: { traceId: "tr_8f29a4c1" } });
		// The AI Assist segment is a real <button>: keyboard reachable + focusable.
		expect(body).toMatch(
			/<button\b[^>]*data-slot="status-footer-ai-assist"/,
		);
		// COPY assertion: visible "AI Assist" label + "⌘/" hint.
		expect(body).toContain("AI Assist");
		expect(body).toMatch(/data-slot="status-footer-ai-assist-kbd"[^>]*>⌘\//);
		expect(body).toMatch(/aria-label="AI Assist \(⌘\/\)"/);
		// OD accent identity: accent left-border on the segment.
		expect(body).toMatch(/data-slot="status-footer-ai-assist"[^>]*class="[^"]*border-l-2[^"]*border-accent/);
		// Focus ring proves keyboard operability.
		expect(body).toMatch(/data-slot="status-footer-ai-assist"[^>]*class="[^"]*focus-visible:ring-2/);
	});

	test("trace id resolves from traceId, then requestId fallback", () => {
		const fromTrace = render(TraceFooter, { props: { traceId: "tr_primary" } });
		expect(fromTrace.body).toMatch(/data-trace-id="tr_primary"/);

		const fromRequest = render(TraceFooter, {
			props: { traceId: null, requestId: "req_fallback" },
		});
		expect(fromRequest.body).toMatch(/data-trace-id="req_fallback"/);
	});

	test("comfortable density renders the 50px footer height", () => {
		const { body } = render(TraceFooter, {
			props: { traceId: "tr_8f29a4c1", mode: "comfortable" },
		});
		expect(body).toMatch(/data-footer-mode="comfortable"/);
		expect(body).toMatch(/class="[^"]*h-\[50px\]/);
	});
});
