import { redactSecretKeys, redactString } from "@platform-core/application/log-redaction/redactor.ts";

let installed = false;

/**
 * Thin formatter that scrubs sensitive keys/headers before any CLI text
 * reaches stdout / stderr. Mirror of `apps/tui/src/log.ts`.
 */
function format(value: unknown): string {
	if (typeof value === "string") return redactString(value);
	if (value === undefined || value === null) return String(value);
	try {
		return JSON.stringify(redactSecretKeys(value, { credentialContext: true }));
	} catch {
		return redactString(String(value));
	}
}

export function logInfo(...values: unknown[]): void {
	const line = values.map(format).join(" ");
	process.stdout.write(`${line}\n`);
}

export function logWarn(...values: unknown[]): void {
	const line = values.map(format).join(" ");
	process.stderr.write(`${line}\n`);
}

export function logError(...values: unknown[]): void {
	const line = values.map(format).join(" ");
	process.stderr.write(`${line}\n`);
}

export function installCliLogRedaction(): void {
	if (installed) return;
	installed = true;
	wrapWrite(process.stdout);
	wrapWrite(process.stderr);
}

function wrapWrite(stream: NodeJS.WriteStream): void {
	const original = stream.write.bind(stream);
	stream.write = ((chunk: unknown, ...args: unknown[]) => {
		const safeChunk = typeof chunk === "string" ? redactString(chunk) : chunk;
		return original(safeChunk as never, ...(args as never[]));
	}) as typeof stream.write;
}

export { format as redactForLog };
