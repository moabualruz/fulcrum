import { describe, expect, test } from "bun:test";
import { redactForLog } from "./log.ts";

describe("cli log formatter", () => {
	test("redacts sensitive keys in objects", () => {
		const out = redactForLog({ token: "abc", id: "u1" });
		expect(out).toContain("<REDACTED>");
		expect(out).not.toContain("abc");
		expect(out).toContain("u1");
	});

	test("redacts Authorization header inside a string", () => {
		const out = redactForLog("HTTP Authorization: Bearer leak123 OK");
		expect(out).toContain("<REDACTED>");
		expect(out).not.toContain("leak123");
	});

	test("passes plain strings through", () => {
		expect(redactForLog("just a message")).toBe("just a message");
	});
});
