import { describe, expect, test } from "bun:test";
import { redactForLog } from "./log.ts";

describe("tui log formatter", () => {
	test("redacts sensitive keys in objects", () => {
		const out = redactForLog({ apiKey: "k1", display: "User" });
		expect(out).toContain("<REDACTED>");
		expect(out).not.toContain("k1");
		expect(out).toContain("User");
	});

	test("redacts cookie header inside a string", () => {
		const out = redactForLog("set-cookie=session=zzz; httponly");
		expect(out).toContain("<REDACTED>");
		expect(out).not.toContain("zzz");
	});
});
