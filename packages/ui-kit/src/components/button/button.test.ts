import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import ButtonRoot, { buttonVariants } from "./button.svelte";

describe("Button — DESIGN.md §4.1 vocabulary", () => {
	test("defaults to the DESIGN primary/md vocabulary", () => {
		const { body } = render(ButtonRoot, { props: {} });

		expect(body).toContain('data-slot="button"');
		expect(body).toContain('data-variant="primary"');
		expect(body).toContain('data-size="md"');
		expect(body).toContain("bg-accent");
		expect(body).toContain("text-accent-foreground");
		expect(body).toContain("h-7");
	});

	test("renders the danger variant with danger token aliases", () => {
		const { body } = render(ButtonRoot, {
			props: { variant: "danger" },
		});

		expect(body).toContain('data-variant="danger"');
		expect(body).toContain("bg-destructive");
		expect(body).toContain("text-destructive-foreground");
	});

	test("keeps legacy names as explicit compatibility aliases", () => {
		expect(buttonVariants({ variant: "default", size: "default" })).toBe(
			buttonVariants({ variant: "primary", size: "md" }),
		);
		expect(buttonVariants({ variant: "destructive" })).toBe(
			buttonVariants({ variant: "danger" }),
		);
	});

	test("uses OKLCH-tokened utilities only — no raw hex/rgb/hsl in markup", () => {
		for (const variant of ["primary", "danger", "outline", "secondary", "ghost", "link"] as const) {
			const { body } = render(ButtonRoot, { props: { variant } });

			expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
			expect(body).not.toMatch(/\brgb\(/);
			expect(body).not.toMatch(/\bhsl\(/);
		}
	});
});
