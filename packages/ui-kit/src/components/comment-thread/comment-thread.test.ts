import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import CommentThreadRoot from "./comment-thread.svelte";
import type { ThreadComment } from "./comment-thread.svelte";

const COMMENTS: ThreadComment[] = [
	{ id: "c1", author: "Jamie Black", body: "Returning kid leaks revocation surface.", ts: "2m", context: "sec-review" },
	{ id: "c2", author: "claude-opus-4.7", body: "Recommend renaming the schema.", ts: "21m", kind: "agent" },
];

describe("CommentThread", () => {
	test("renders the anchor, chip, and one keyed comment per entry", () => {
		const { body } = render(CommentThreadRoot, {
			props: {
				threadId: "session-ts-46",
				anchorLabel: "src/auth/session.ts · L46",
				anchorChip: "session.ts:46",
				comments: COMMENTS,
			},
		});
		expect(body).toContain('data-slot="comment-thread"');
		expect(body).toContain('data-comment-thread="session-ts-46"');
		expect(body).toContain('data-slot="comment-thread-anchor-chip"');
		expect(body).toContain("session.ts:46");
		expect(body).toContain('data-comment-thread-comment="c1"');
		expect(body).toContain('data-comment-thread-comment="c2"');
	});

	test("agent authorship gets a distinct avatar kind (DESIGN.md §9.1)", () => {
		const { body } = render(CommentThreadRoot, {
			props: { threadId: "t", anchorLabel: "a", comments: COMMENTS },
		});
		expect(body).toContain('data-comment-author-kind="human"');
		expect(body).toContain('data-comment-author-kind="agent"');
	});

	test("open state shows the reply composer", () => {
		const { body } = render(CommentThreadRoot, {
			props: { threadId: "t", anchorLabel: "a", comments: COMMENTS, threadState: "open" },
		});
		expect(body).toContain('data-thread-state="open"');
		expect(body).toContain('data-slot="comment-thread-composer"');
		expect(body).toContain('data-comment-thread-reply-input="t"');
	});

	test("resolved state fades and suppresses the composer", () => {
		const { body } = render(CommentThreadRoot, {
			props: { threadId: "t", anchorLabel: "a", comments: COMMENTS, threadState: "resolved" },
		});
		expect(body).toContain('data-resolved="true"');
		expect(body).toContain('data-slot="comment-thread-resolved"');
		expect(body).not.toContain('data-slot="comment-thread-composer"');
	});

	test("empty state shows the start-thread branch", () => {
		const { body } = render(CommentThreadRoot, {
			props: { threadId: "t", anchorLabel: "a", threadState: "empty" },
		});
		expect(body).toContain('data-slot="comment-thread-empty"');
	});

	test("failed-save state surfaces the retry alert", () => {
		const { body } = render(CommentThreadRoot, {
			props: { threadId: "t", anchorLabel: "a", comments: COMMENTS, threadState: "failed-save" },
		});
		expect(body).toContain('data-slot="comment-thread-failed-save"');
		expect(body).toContain('role="alert"');
	});

	test("permission state is read-only — no composer", () => {
		const { body } = render(CommentThreadRoot, {
			props: { threadId: "t", anchorLabel: "a", comments: COMMENTS, threadState: "permission" },
		});
		expect(body).toContain('data-slot="comment-thread-permission"');
		expect(body).not.toContain('data-slot="comment-thread-composer"');
	});

	test("uses OKLCH-tokened utilities only — no raw hex/hsl in markup", () => {
		const { body } = render(CommentThreadRoot, {
			props: { threadId: "t", anchorLabel: "a", comments: COMMENTS },
		});
		expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		expect(body).not.toMatch(/\bhsl\(/);
	});
});
