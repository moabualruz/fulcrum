import {
	type CallHandler,
	type ExecutionContext,
	Injectable,
	Logger,
	type NestInterceptor,
} from "@nestjs/common";
import { catchError, type Observable, tap, throwError } from "rxjs";

import { redactSecretKeys, redactString } from "./redactor.ts";

/**
 * Global NestJS interceptor that emits one redacted log line per HTTP /
 * tRPC request. Sensitive keys (token, api_key, password, authorization,
 * cookie, …) in headers / body / errors are replaced with the literal
 * "<REDACTED>" before the line reaches the underlying NestJS logger.
 *
 * Wire once at bootstrap via `app.useGlobalInterceptors(new LogRedactionInterceptor())`.
 */
@Injectable()
export class LogRedactionInterceptor implements NestInterceptor {
	private readonly logger = new Logger("HTTP");

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const start = Date.now();
		const req = context.switchToHttp().getRequest<{
			method?: string;
			url?: string;
			headers?: Record<string, unknown>;
			body?: unknown;
		} | undefined>();

		if (req) {
			const safeHeaders = redactSecretKeys(req.headers ?? {});
			const safeBody = redactSecretKeys(req.body ?? {}, { credentialContext: true });
			this.logger.log({
				event: "request.in",
				method: req.method,
				url: req.url,
				headers: safeHeaders,
				body: safeBody,
			});
		}

		return next.handle().pipe(
			tap((value) => {
				const elapsedMs = Date.now() - start;
				const safe = redactSecretKeys(value, { credentialContext: true });
				this.logger.log({
					event: "request.out",
					method: req?.method,
					url: req?.url,
					elapsedMs,
					response: safe,
				});
			}),
			catchError((err) => {
				const elapsedMs = Date.now() - start;
				const safeErr = redactSecretKeys(serialiseError(err), { credentialContext: true });
				this.logger.error({
					event: "request.error",
					method: req?.method,
					url: req?.url,
					elapsedMs,
					error: safeErr,
				});
				return throwError(() => err);
			}),
		);
	}
}

function serialiseError(err: unknown): unknown {
	if (err instanceof Error) {
		return {
			name: err.name,
			message: redactString(err.message),
			stack: err.stack ? redactString(err.stack) : undefined,
		};
	}
	if (typeof err === "string") return redactString(err);
	return err;
}
