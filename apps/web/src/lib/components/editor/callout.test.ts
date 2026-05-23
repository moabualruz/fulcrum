import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Window } from "happy-dom";
import { CALLOUT_TYPES, CalloutNode, getSlashMenuItems, insertSlashMenuItem } from "./slash-menu";

const globals = globalThis as unknown as Record<string, unknown>;
const savedGlobals = {
	window: globals["window"],
	document: globals["document"],
	HTMLElement: globals["HTMLElement"],
	requestAnimationFrame: globals["requestAnimationFrame"],
};

beforeAll(() => {
	const window = new Window();
	window.SyntaxError = SyntaxError;
	// happy-dom's Window does not surface the ES URI helpers; PGlite-backed
	// tests that run later in the same process read `window.encodeURIComponent`.
	(window as unknown as Record<string, unknown>)["encodeURIComponent"] = encodeURIComponent;
	(window as unknown as Record<string, unknown>)["decodeURIComponent"] = decodeURIComponent;
	globals.window = window;
	globals.document = window.document;
	globals.HTMLElement = window.HTMLElement;
	globals.requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(callback, 0);
});

afterAll(() => {
	// Restore the globals so later test files do not inherit a happy-dom window.
	for (const [key, value] of Object.entries(savedGlobals)) {
		if (value === undefined) delete globals[key];
		else globals[key] = value;
	}
});

function createCalloutEditor(): Editor {
	return new Editor({
		extensions: [StarterKit, CalloutNode],
		content: { type: "doc", content: [{ type: "paragraph" }] },
	});
}

describe("editor callouts", () => {
	test("slash menu exposes every callout type with discoverable aliases", () => {
		const items = getSlashMenuItems();
		for (const type of CALLOUT_TYPES) {
			const item = items.find((entry) => entry.id === `callout-${type}`);
			expect(item, `slash entry callout-${type}`).toBeDefined();
			expect(item?.label.toLowerCase()).toContain(type);
			expect(item?.aliases).toContain("callout");
		}
	});

	test("inserting each callout slash item produces a typed callout with heading and body", () => {
		for (const type of CALLOUT_TYPES) {
			const editor = createCalloutEditor();
			expect(insertSlashMenuItem(editor, `callout-${type}`)).toBe(true);
			const doc = editor.getJSON();
			const callout = (doc.content ?? []).find((node) => node.type === "callout");
			expect(callout, `${type} callout inserted`).toBeDefined();
			expect(callout?.attrs?.type).toBe(type);
			const heading = callout?.content?.find((node) => node.type === "heading");
			const paragraph = callout?.content?.find((node) => node.type === "paragraph");
			expect(heading, `${type} heading`).toBeDefined();
			expect(paragraph, `${type} paragraph`).toBeDefined();
			editor.destroy();
		}
	});

	test("rendered callout HTML carries role=note, aria-label, and aria-hidden icon", () => {
		const editor = new Editor({
			extensions: [StarterKit, CalloutNode],
			content: {
				type: "doc",
				content: [
					{
						type: "callout",
						attrs: { type: "warning" },
						content: [{ type: "paragraph", content: [{ type: "text", text: "Heads up." }] }],
					},
				],
			},
		});
		const html = editor.getHTML();
		expect(html).toContain('role="note"');
		expect(html).toContain('aria-label="Warning callout"');
		expect(html).toContain('data-callout="warning"');
		expect(html).toContain('class="callout callout--warning"');
		expect(html).toContain('aria-hidden="true"');
		editor.destroy();
	});

	test("unknown callout types are coerced to info to keep the contract closed", () => {
		const editor = new Editor({
			extensions: [StarterKit, CalloutNode],
			content: {
				type: "doc",
				content: [
					{
						type: "callout",
						attrs: { type: "wat" },
						content: [{ type: "paragraph", content: [{ type: "text", text: "fallback" }] }],
					},
				],
			},
		});
		const html = editor.getHTML();
		expect(html).toContain('data-callout="info"');
		expect(html).toContain('aria-label="Info callout"');
		editor.destroy();
	});
});
