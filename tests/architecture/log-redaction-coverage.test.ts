import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..", "..");

describe("log redaction coverage", () => {
	test("redactor module is present", () => {
		expect(
			existsSync(
				join(ROOT, "services/platform-core/src/application/log-redaction/redactor.ts"),
			),
		).toBe(true);
	});

	test("global LogRedactionInterceptor is wired in apps/server bootstrap", async () => {
		const source = await readFile(join(ROOT, "apps/server/src/nest-application.ts"), "utf8");
		expect(source).toContain("LogRedactionInterceptor");
		expect(source).toContain("useGlobalInterceptors(new LogRedactionInterceptor())");
	});

	test("CLI log formatter exists and depends on redactor", async () => {
		const source = await readFile(join(ROOT, "apps/cli/src/log.ts"), "utf8");
		expect(source).toContain("redactSecretKeys");
		expect(source).toContain("redactString");
	});

	test("TUI log formatter exists and depends on redactor", async () => {
		const source = await readFile(join(ROOT, "apps/tui/src/log.ts"), "utf8");
		expect(source).toContain("redactSecretKeys");
		expect(source).toContain("redactString");
	});

	test("sensitive key list includes the canonical set required by the PRD", async () => {
		const source = await readFile(
			join(ROOT, "services/platform-core/src/application/log-redaction/redactor.ts"),
			"utf8",
		);
		for (const key of [
			"token",
			"api_key",
			"apiKey",
			"password",
			"secret",
			"authorization",
			"cookie",
			"x-api-key",
			"set-cookie",
		]) {
			expect(source.toLowerCase()).toContain(key.toLowerCase());
		}
	});
});
