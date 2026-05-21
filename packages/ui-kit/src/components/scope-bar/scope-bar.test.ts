import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import ScopeBarRoot from "./scope-bar.svelte";

describe("ScopeBar", () => {
	test("renders the brand, workspace path, and the six stage tabs", () => {
		const { body } = render(ScopeBarRoot, {
			props: { brand: "Fulcrum", workspacePath: "mkh / fulcrum · auth-rewrite" },
		});
		expect(body).toContain('data-slot="scope-bar"');
		expect(body).toContain("Fulcrum");
		expect(body).toContain("mkh / fulcrum · auth-rewrite");
		for (const label of ["Capture", "Plan", "Build", "Review", "Ship", "Operate"]) {
			expect(body).toContain(label);
		}
	});

	test("carries the data-scope-bar state attribute and a banner role", () => {
		const { body } = render(ScopeBarRoot, { props: {} });
		expect(body).toContain("data-scope-bar");
		expect(body).toContain('role="banner"');
	});

	test("marks the active stage tab via data-active and aria-selected", () => {
		const { body } = render(ScopeBarRoot, { props: { activeStage: "build" } });
		expect(body).toContain('data-active-stage="build"');
		expect(body).toContain('data-stage="build"');
		expect(body).toContain('aria-current="page"');
	});

	test("uses ordinary navigation buttons instead of ARIA tabs", () => {
		const { body } = render(ScopeBarRoot, { props: { activeStage: "review" } });

		expect(body).toContain('aria-label="Stages"');
		expect(body).not.toContain('role="tab"');
		expect(body).not.toContain('role="tablist"');
		expect(body).not.toContain("aria-selected");
	});

	test("uses OKLCH-tokened utilities only — no raw hex/hsl in markup", () => {
		const { body } = render(ScopeBarRoot, { props: { activeStage: "plan" } });
		expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		expect(body).not.toMatch(/\bhsl\(/);
	});
});
