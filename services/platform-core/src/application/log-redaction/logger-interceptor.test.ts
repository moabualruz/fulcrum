import { describe, expect, mock, test } from "bun:test";
import { of, throwError } from "rxjs";

import { LogRedactionInterceptor } from "./logger-interceptor.ts";

interface CapturedLogger {
	log: ReturnType<typeof mock>;
	error: ReturnType<typeof mock>;
}

function fakeContext(req: {
	method?: string;
	url?: string;
	headers?: Record<string, unknown>;
	body?: unknown;
}) {
	return {
		switchToHttp: () => ({ getRequest: () => req }),
	} as unknown as Parameters<LogRedactionInterceptor["intercept"]>[0];
}

function installCapturedLogger(interceptor: LogRedactionInterceptor): CapturedLogger {
	const captured: CapturedLogger = { log: mock(() => {}), error: mock(() => {}) };
	Object.assign(interceptor as unknown as { logger: CapturedLogger }, { logger: captured });
	return captured;
}

describe("LogRedactionInterceptor", () => {
	test("redacts sensitive headers and body before logging on entry + exit", async () => {
		const interceptor = new LogRedactionInterceptor();
		const logger = installCapturedLogger(interceptor);
		const ctx = fakeContext({
			method: "POST",
			url: "/credentials",
			headers: { authorization: "Bearer leak" },
			body: { name: "linear", value: "sk_secret", kind: "credential" },
		});
		const handler = { handle: () => of({ ok: true, token: "should-also-vanish" }) };

		await new Promise<void>((resolve, reject) => {
			interceptor.intercept(ctx, handler).subscribe({ next: () => {}, error: reject, complete: resolve });
		});

		expect(logger.log).toHaveBeenCalledTimes(2);
		const inboundCall = logger.log.mock.calls[0]?.[0] as Record<string, unknown>;
		const outboundCall = logger.log.mock.calls[1]?.[0] as Record<string, unknown>;
		const serialised = JSON.stringify({ inboundCall, outboundCall });
		expect(serialised).toContain("<REDACTED>");
		expect(serialised).not.toContain("leak");
		expect(serialised).not.toContain("sk_secret");
		expect(serialised).not.toContain("should-also-vanish");
	});

	test("redacts errors on the failure path and re-throws", async () => {
		const interceptor = new LogRedactionInterceptor();
		const logger = installCapturedLogger(interceptor);
		const ctx = fakeContext({ method: "GET", url: "/x", headers: {}, body: {} });
		const handler = { handle: () => throwError(() => new Error("boom Authorization: Bearer leak")) };

		await expect(
			new Promise((_resolve, reject) => {
				interceptor.intercept(ctx, handler).subscribe({
					next: () => {},
					error: (err) => reject(err),
					complete: () => {},
				});
			}),
		).rejects.toThrow("boom");

		expect(logger.error).toHaveBeenCalledTimes(1);
		const args = logger.error.mock.calls[0]?.[0] as Record<string, unknown>;
		const serialised = JSON.stringify(args);
		expect(serialised).toContain("<REDACTED>");
		expect(serialised).not.toContain("leak");
	});
});
