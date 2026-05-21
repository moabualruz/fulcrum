import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import ButtonRoot, { buttonVariants, type ButtonSize, type ButtonVariant } from "./button.svelte";

const designButtonVariants = ["primary", "secondary", "ghost", "danger", "link"] as const satisfies readonly ButtonVariant[];
const designButtonSizes = ["xs", "sm", "md", "lg"] as const satisfies readonly ButtonSize[];

describe("Button — DESIGN.md §4.1 vocabulary", () => {
	test("exports only DESIGN public variant and size vocabulary", () => {
		type Equal<A, B> =
			(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

		const variantVocabularyIsDesignOnly: Equal<ButtonVariant, (typeof designButtonVariants)[number]> = true;
		const sizeVocabularyIsDesignOnly: Equal<ButtonSize, (typeof designButtonSizes)[number]> = true;

		expect(variantVocabularyIsDesignOnly).toBe(true);
		expect(sizeVocabularyIsDesignOnly).toBe(true);
	});

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
		expect(buttonVariants({ variant: "outline" })).toBe(
			buttonVariants({ variant: "secondary" }),
		);
	});

	test("uses OKLCH-tokened utilities only — no raw hex/rgb/hsl in markup", () => {
		for (const variant of designButtonVariants) {
			const { body } = render(ButtonRoot, { props: { variant } });

			expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
			expect(body).not.toMatch(/\brgb\(/);
			expect(body).not.toMatch(/\bhsl\(/);
		}
	});

	test("renders loading state hooks and ARIA", () => {
		const { body } = render(ButtonRoot, {
			props: { loading: true },
		});

		expect(body).toContain('data-loading="true"');
		expect(body).toContain('aria-busy="true"');
		expect(body).toContain("data-[loading=true]:cursor-wait");
	});

	test("renders selected state hooks and ARIA for button and link modes", () => {
		const button = render(ButtonRoot, {
			props: { selected: true },
		});
		const link = render(ButtonRoot, {
			props: { href: "/projects", selected: true },
		});

		expect(button.body).toContain('data-selected="true"');
		expect(button.body).toContain('aria-pressed="true"');
		expect(button.body).toContain("data-[selected=true]:ring-2");
		expect(link.body).toContain('data-selected="true"');
		expect(link.body).toContain('aria-current="page"');
	});
});
