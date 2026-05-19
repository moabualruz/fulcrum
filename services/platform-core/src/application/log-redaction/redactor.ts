/**
 * Log redaction primitive.
 *
 * `redactSecretKeys` walks any value and replaces any property whose key
 * (case-insensitive) matches a known sensitive name with the literal
 * "<REDACTED>". Used by the global Nest LoggerInterceptor and by the
 * CLI/TUI log formatter so that no credential plaintext reaches stdout,
 * stderr, persisted crashlogs, or downstream audit sinks.
 *
 * Why a blacklist of canonical keys instead of a value-pattern detector:
 * value heuristics produce false negatives on opaque tokens that look like
 * random strings. Keys are stable contracts inside a logging payload, so
 * matching the carrier names catches the secret at every entry point.
 */

const SENSITIVE_KEYS: ReadonlyArray<string> = [
	"token",
	"tokens",
	"api_key",
	"apikey",
	"password",
	"passphrase",
	"secret",
	"client_secret",
	"clientsecret",
	"authorization",
	"cookie",
	"set-cookie",
	"x-api-key",
	"private_key",
	"privatekey",
	"refresh_token",
	"refreshtoken",
	"access_token",
	"accesstoken",
	"session",
	"session_id",
	"sessionid",
	"id_token",
	"idtoken",
];

const SENSITIVE_KEY_SET: ReadonlySet<string> = new Set(SENSITIVE_KEYS.map((k) => k.toLowerCase()));

export const REDACTED_PLACEHOLDER = "<REDACTED>" as const;

export interface RedactOptions {
	/**
	 * Treat a property called `value` as a secret only when the same level
	 * of the object also carries a credential-context key (e.g. `kind` set
	 * to `credential` or a sibling `name` plus `provider`). Default false.
	 */
	credentialContext?: boolean;
	/** Max recursion depth before short-circuiting to the placeholder. */
	maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 16;

function isCredentialContext(parent: Record<string, unknown>): boolean {
	const kind = parent["kind"] ?? parent["type"];
	if (typeof kind === "string") {
		const lower = kind.toLowerCase();
		if (lower === "credential" || lower === "secret" || lower === "api-key") return true;
	}
	if ("provider" in parent && "name" in parent && "value" in parent) return true;
	return false;
}

function shouldRedactKey(
	key: string,
	parent: Record<string, unknown>,
	opts: RedactOptions,
): boolean {
	const lower = key.toLowerCase();
	if (SENSITIVE_KEY_SET.has(lower)) return true;
	if (opts.credentialContext && lower === "value" && isCredentialContext(parent)) return true;
	return false;
}

export function redactSecretKeys<T>(input: T, options: RedactOptions = {}): T {
	const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
	return walk(input, 0, maxDepth, options) as T;
}

function walk(value: unknown, depth: number, maxDepth: number, opts: RedactOptions): unknown {
	if (depth > maxDepth) return REDACTED_PLACEHOLDER;
	if (value === null || value === undefined) return value;
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((item) => walk(item, depth + 1, maxDepth, opts));
	}
	if (typeof value === "object") {
		const source = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(source)) {
			if (shouldRedactKey(key, source, opts)) {
				out[key] = REDACTED_PLACEHOLDER;
			} else {
				out[key] = walk(source[key], depth + 1, maxDepth, opts);
			}
		}
		return out;
	}
	return value;
}

/** Convenience for stringified log lines. */
export function redactString(input: string, _options: RedactOptions = {}): string {
	let out = input;
	// Authorization / proxy-authorization "scheme value" pair → replace whole tail.
	out = out.replace(
		/((?:authorization|proxy-authorization))\s*[:=]\s*\S+(?:\s+\S+)?/gi,
		(_match, key) => `${key}: ${REDACTED_PLACEHOLDER}`,
	);
	// Header-style key:value or key=value for known carriers.
	const headerPattern =
		/((?:cookie|set-cookie|x-api-key|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|password|secret|token))\s*[:=]\s*([^\s,;]+)/gi;
	out = out.replace(headerPattern, (_match, key) => `${key}: ${REDACTED_PLACEHOLDER}`);
	return out;
}

export const SENSITIVE_LOG_KEYS = SENSITIVE_KEYS;
