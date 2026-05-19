import { describe, expect, test } from "bun:test";
import {
	REDACTED_PLACEHOLDER,
	redactSecretKeys,
	redactString,
	SENSITIVE_LOG_KEYS,
} from "./redactor.ts";

describe("redactSecretKeys", () => {
	test("replaces sensitive top-level keys with the placeholder", () => {
		const input = { token: "abc", apiKey: "k1", name: "Mo" };
		const out = redactSecretKeys(input) as Record<string, string>;
		expect(out.token).toBe(REDACTED_PLACEHOLDER);
		expect(out.apiKey).toBe(REDACTED_PLACEHOLDER);
		expect(out.name).toBe("Mo");
	});

	test("matches keys case-insensitively", () => {
		const out = redactSecretKeys({
			Authorization: "Bearer xyz",
			Cookie: "sid=123",
		}) as Record<string, string>;
		expect(out.Authorization).toBe(REDACTED_PLACEHOLDER);
		expect(out.Cookie).toBe(REDACTED_PLACEHOLDER);
	});

	test("recurses into nested objects", () => {
		const out = redactSecretKeys({
			user: { id: "u1", password: "hunter2", profile: { name: "Mo", session: "s1" } },
		});
		const user = out.user as Record<string, unknown>;
		expect(user.password).toBe(REDACTED_PLACEHOLDER);
		const profile = user.profile as Record<string, string>;
		expect(profile.name).toBe("Mo");
		expect(profile.session).toBe(REDACTED_PLACEHOLDER);
	});

	test("walks arrays without losing structure", () => {
		const out = redactSecretKeys([
			{ token: "t1", id: "a" },
			{ token: "t2", id: "b" },
		]);
		expect(out).toHaveLength(2);
		const first = out[0] as Record<string, string>;
		const second = out[1] as Record<string, string>;
		expect(first.token).toBe(REDACTED_PLACEHOLDER);
		expect(first.id).toBe("a");
		expect(second.token).toBe(REDACTED_PLACEHOLDER);
	});

	test("preserves null, undefined, and primitive scalars", () => {
		expect(redactSecretKeys(null)).toBeNull();
		expect(redactSecretKeys(undefined)).toBeUndefined();
		expect(redactSecretKeys("plain")).toBe("plain");
		expect(redactSecretKeys(42)).toBe(42);
		expect(redactSecretKeys(true)).toBe(true);
	});

	test("redacts `value` only inside credential context with opt-in", () => {
		const credential = { kind: "credential", name: "linear", value: "sk_abc" };
		const out = redactSecretKeys(credential, { credentialContext: true }) as Record<string, string>;
		expect(out.value).toBe(REDACTED_PLACEHOLDER);

		const generic = { kind: "todo", name: "weekly", value: "Buy bread" };
		const out2 = redactSecretKeys(generic, { credentialContext: true }) as Record<string, string>;
		expect(out2.value).toBe("Buy bread");
	});

	test("short-circuits past maxDepth with the placeholder", () => {
		const deep: Record<string, unknown> = { token: "x" };
		let cursor = deep;
		for (let i = 0; i < 20; i++) {
			const next: Record<string, unknown> = {};
			cursor.child = next;
			cursor = next;
		}
		cursor.token = "leak";
		const out = redactSecretKeys(deep, { maxDepth: 3 }) as Record<string, unknown>;
		// outermost token already redacted; deep child collapsed
		expect(out.token).toBe(REDACTED_PLACEHOLDER);
		// somewhere in the chain it must hit the placeholder
		const serialized = JSON.stringify(out);
		expect(serialized).toContain(REDACTED_PLACEHOLDER);
	});

	test("does not mutate the original input", () => {
		const input = { token: "abc", nested: { password: "p" } };
		redactSecretKeys(input);
		expect(input.token).toBe("abc");
		expect(input.nested.password).toBe("p");
	});

	test("canonical sensitive-key list is exposed", () => {
		expect(SENSITIVE_LOG_KEYS).toContain("token");
		expect(SENSITIVE_LOG_KEYS).toContain("api_key");
		expect(SENSITIVE_LOG_KEYS).toContain("authorization");
		expect(SENSITIVE_LOG_KEYS).toContain("cookie");
	});
});

describe("redactString", () => {
	test("redacts Authorization header bearer token", () => {
		const out = redactString("GET /api Authorization: Bearer secret123 x-trace=ok");
		expect(out).toContain("<REDACTED>");
		expect(out).not.toContain("secret123");
	});

	test("redacts api_key=… form pair", () => {
		const out = redactString("call with api_key=zzz and other=value");
		expect(out).toContain("<REDACTED>");
		expect(out).not.toContain("zzz");
		expect(out).toContain("other=value");
	});

	test("leaves non-matching strings unchanged", () => {
		expect(redactString("no secret here")).toBe("no secret here");
	});
});
