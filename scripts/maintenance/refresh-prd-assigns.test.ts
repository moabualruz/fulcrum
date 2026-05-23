import { describe, expect, test } from "bun:test";
import { extractTokens, rankCandidates, type PrdEntry } from "./refresh-prd-assigns.ts";

const sample: PrdEntry = {
	id: "prd-docmost-member-invite-link",
	status: "done",
	title: "Workspace member invite link lands on token page",
	acceptance: [
		"apps/web/src/routes/auth/invite/[token]/+page.svelte renders the invite",
		"server action validates token before binding membership",
	],
	assigns: ["apps/web/src/routes/auth/invite-stale/+page.svelte"],
};

describe("refresh-prd-assigns helpers", () => {
	test("extractTokens drops stopwords and short fragments", () => {
		const tokens = extractTokens(sample);
		expect(tokens).toContain("invite");
		expect(tokens).toContain("token");
		expect(tokens).toContain("membership");
		expect(tokens).not.toContain("the");
		expect(tokens).not.toContain("on");
	});

	test("rankCandidates orders files by overlapping token count", () => {
		const files = [
			"apps/web/src/routes/auth/invite/[token]/+page.svelte",
			"apps/web/src/routes/random/+page.svelte",
			"apps/web/src/routes/auth/login/+page.svelte",
		];
		const tokens = ["invite", "token", "membership"];
		const ranked = rankCandidates(tokens, files);
		expect(ranked[0]?.path).toBe("apps/web/src/routes/auth/invite/[token]/+page.svelte");
		expect(ranked[0]?.score).toBeGreaterThanOrEqual(2);
	});

	test("rankCandidates returns empty list when no tokens provided", () => {
		expect(rankCandidates([], ["any/path.ts"])).toEqual([]);
	});

	test("rankCandidates respects the result limit", () => {
		const files = Array.from({ length: 50 }, (_, i) => `apps/web/src/routes/invite${i}.svelte`);
		const ranked = rankCandidates(["invite"], files, 3);
		expect(ranked).toHaveLength(3);
	});
});
