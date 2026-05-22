import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("Form controls - DESIGN.md §4.2 height contract", () => {
	test("Input defaults to the 28px md control height", () => {
		const source = read("packages/ui-kit/src/components/input/input.svelte");

		expect(source).toContain("h-7");
		expect(source).not.toContain("h-9");
	});

	test("Select trigger maps md to 28px and keeps adjacent sizes on the button ladder", () => {
		const source = read("packages/ui-kit/src/components/select/select-trigger.svelte");

		expect(source).toContain('sm: "h-6');
		expect(source).toContain('md: "h-7');
		expect(source).toContain('lg: "h-8');
		expect(source).not.toContain('md: "h-9');
	});

	test("Textarea exposes a compact one-row 28px default before multi-row expansion", () => {
		const source = read("packages/ui-kit/src/components/textarea/textarea.svelte");

		expect(source).toContain("min-h-7");
		expect(source).toContain("py-1");
		expect(source).not.toContain("min-h-[calc(var(--field-min-h,5rem))]");
		expect(source).not.toContain("py-2");
	});

	test("design-kit FormField fixture consumes the exported Input primitive", () => {
		const source = read("apps/web/src/routes/design-kit/+page.svelte");

		expect(source).toContain("\t\tInput,");
		expect(source).toContain("<Input");
		expect(source).not.toContain('class="h-9 w-full rounded-md border border-input');
	});
});
