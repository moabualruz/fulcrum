/**
 * Rendered-screenshot design-gate harness.
 *
 * Three responsibilities, all run only when this file is the process entrypoint:
 *   1. Screenshot-capture phase — build the web app, boot a real preview
 *      server, drive Playwright chromium over every production route the
 *      harness enumerates (at minimum `/`), capture one desktop-viewport
 *      screenshot per route, then tear the browser + server down cleanly.
 *   2. Source-contract phase — run the design-e2e `*.test.ts` files under
 *      `bun test`: the regression guard that fails if a `.spec.ts` imports
 *      `bun:test` without launching a page, plus architecture source-contract
 *      checks. Labelled separately from visual design so test output
 *      distinguishes source-contract checks from rendered design tests.
 *   3. Visual design phase — run the design-e2e Playwright `*.spec.ts` specs
 *      (including `harness.spec.ts`) against the chunked Playwright `webServer`
 *      setup. These are the only files that prove rendered OD fidelity.
 *
 * `captureScreenshot` is exported as a side-effect-free helper so design-e2e
 * specs can import it directly — proving the harness is consumed, not dead.
 * Importing this module never boots a server or a browser; only running it as
 * the entrypoint does (guarded by `import.meta.main`). Capturing a route is
 * unconditional: the harness capture phase never hard-fails because an OD
 * shell primitive is absent. The StageRail / ScopeBar / StatusFooter /
 * TraceBadge / AI Assist presence assertions are owned by
 * `prd-design-gate-shell-assertions` and live in the wave-2
 * `shell-presence.spec.ts`, which this harness runs as part of the default
 * `test:design` spec list (`DEFAULT_DESIGN_SPECS`).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chromium, type Page } from "@playwright/test";
import { allocatePortBlock } from "./e2e-ports";

/** A production route the harness renders and screenshots. */
export interface DesignRoute {
	/** SvelteKit route path, e.g. "/" or "/build-board". */
	path: string;
	/** Stable artifact slug; "/" maps to "root". */
	slug: string;
}

/** Desktop viewport the harness renders production routes at. */
export const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;

/** Directory the harness writes per-route screenshot artifacts into. */
export const SCREENSHOT_DIR = path.resolve(
	process.cwd(),
	"../../.scratch/design-fidelity-review-2026-05-20/screenshots",
);

/**
 * Capture a desktop-viewport screenshot of the currently-loaded page.
 *
 * Side-effect-free apart from writing the PNG: importable by design-e2e specs
 * so the harness helper is exercised by a rendered test, not just the runner.
 * Returns the absolute artifact path.
 */
export async function captureScreenshot(
	page: Page,
	slug: string,
	options: { dir?: string; fullPage?: boolean } = {},
): Promise<string> {
	const dir = options.dir ?? SCREENSHOT_DIR;
	mkdirSync(dir, { recursive: true });
	const file = path.join(dir, `${slug}.png`);
	await page.screenshot({ path: file, fullPage: options.fullPage ?? true });
	return file;
}

/**
 * Enumerate the production routes the harness renders. `/` is always included.
 * Skips non-renderable route groups: API endpoints and dynamic-param segments
 * that need an id to resolve.
 */
export function enumerateDesignRoutes(routesDir: string): DesignRoute[] {
	const routes: DesignRoute[] = [{ path: "/", slug: "root" }];
	let topLevel: string[] = [];
	try {
		topLevel = readdirSync(routesDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.filter((name) => name !== "api" && !name.startsWith("(") && !name.startsWith("[") && !name.startsWith("."))
			.sort();
	} catch {
		topLevel = [];
	}
	for (const name of topLevel) {
		routes.push({ path: `/${name}`, slug: name });
	}
	return routes;
}

interface BootedServer {
	url: string;
	port: number;
	stop: () => Promise<void>;
}

function syncSvelteKitProject(projectRoot: string): void {
	const result = spawnSync("bun", ["run", "svelte-kit", "sync"], {
		cwd: projectRoot,
		stdio: "inherit",
		env: process.env,
	});
	if (result.status !== 0) {
		throw new Error(`design-e2e harness: svelte-kit sync failed for ${projectRoot} (exit ${result.status ?? "unknown"})`);
	}
}

function syncSvelteKitProjects(webRoot: string): void {
	syncSvelteKitProject(webRoot);
	syncSvelteKitProject(path.resolve(webRoot, "../../packages/ui-kit"));
}

/** Absolute path to the SvelteKit `vite build` server output directory. */
function svelteKitOutputDir(webRoot: string): string {
	return path.join(webRoot, ".svelte-kit/output");
}

/**
 * Build the web app to a *complete, verified* `.svelte-kit/output` directory.
 *
 * The build is the single source of design-gate non-determinism the closure
 * review flagged: when `vite build` is run inside Playwright's `webServer`
 * command it competes with Playwright's own `webServer.timeout`, and an
 * interrupted build leaves a partial `.svelte-kit/output` whose
 * `manifest-full.js` imports `nodes/<n>.js` files that were never written —
 * the `ERR_MODULE_NOT_FOUND` the review saw. So the harness owns the build:
 *
 *   1. `syncSvelteKitProjects` regenerates the SvelteKit `.svelte-kit` project
 *      files for web + ui-kit so the build never reads stale generated input.
 *   2. `rmSync` the stale output dir so no prior partial build can be reused.
 *   3. Run `vite build` to completion synchronously (`spawnSync`), fail-fast
 *      on any non-zero exit — a failed build is a hard error, never a partial
 *      directory handed to `vite preview`.
 *   4. Verify the produced server manifest is internally consistent — every
 *      `nodes/<n>.js` the manifest enumerates must exist on disk before any
 *      preview server is allowed to serve it.
 *
 * Building once here (not inside the Playwright `webServer` command) removes
 * the race entirely: the build is complete and verified before a server boots.
 */
function buildWebAppVerified(webRoot: string): void {
	syncSvelteKitProjects(webRoot);

	const outputDir = svelteKitOutputDir(webRoot);
	// Always start from a clean slate — a leftover partial build from a killed
	// prior run must never survive into a `vite preview` startup.
	rmSync(outputDir, { recursive: true, force: true });

	const build = spawnSync("bun", ["run", "build"], { cwd: webRoot, stdio: "inherit", env: process.env });
	if (build.status !== 0) {
		throw new Error(`design-e2e harness: web build failed (exit ${build.status ?? "unknown"})`);
	}

	assertBuildOutputComplete(outputDir);
}

/**
 * Fail loudly if `vite build` produced an inconsistent server bundle.
 *
 * `manifest-full.js` enumerates every route node as `() => import('./nodes/N.js')`.
 * A complete build has every referenced `nodes/N.js` on disk; a partial build
 * (the closure-review failure mode) is missing one. Verifying here turns a
 * downstream `vite preview` `ERR_MODULE_NOT_FOUND` at request time into an
 * immediate, attributable harness error before any server or browser starts.
 */
function assertBuildOutputComplete(outputDir: string): void {
	const serverDir = path.join(outputDir, "server");
	const manifestPath = path.join(serverDir, "manifest-full.js");
	if (!existsSync(manifestPath)) {
		throw new Error(
			`design-e2e harness: web build incomplete — ${manifestPath} missing after build`,
		);
	}

	const manifest = readFileSync(manifestPath, "utf8");
	const referencedNodes = new Set<string>();
	for (const match of manifest.matchAll(/['"`]\.\/nodes\/(\d+)\.js['"`]/g)) {
		referencedNodes.add(match[1]);
	}

	const missing: string[] = [];
	for (const node of referencedNodes) {
		if (!existsSync(path.join(serverDir, "nodes", `${node}.js`))) {
			missing.push(`nodes/${node}.js`);
		}
	}

	if (missing.length > 0) {
		throw new Error(
			`design-e2e harness: web build incomplete — manifest-full.js references ` +
				`missing server node file(s): ${missing.join(", ")}. Re-run after a clean build.`,
		);
	}
}

/**
 * Boot a real `vite preview` server on an allocated port, against an
 * already-built, already-verified `.svelte-kit/output`.
 *
 * The build is NOT done here — `buildWebAppVerified` must have run first. This
 * keeps "produce the bundle" and "serve the bundle" as two ordered, observable
 * steps with no overlap, so the preview server can never start against a
 * half-written build.
 */
async function bootPreviewServer(webRoot: string): Promise<BootedServer> {
	assertBuildOutputComplete(svelteKitOutputDir(webRoot));

	// Default to a freshly-allocated free port — `allocatePortBlock` proves the
	// port is actually free before returning it, so `vite preview` cannot lose
	// an `EADDRINUSE` race. An explicit base is honored only when a caller pins
	// one (capture vs spec phase share this contract).
	const preferredBaseRaw =
		process.env.FULCRUM_DESIGN_E2E_CAPTURE_PORT_BASE ?? process.env.FULCRUM_DESIGN_E2E_PORT_BASE;
	const [port] = await allocatePortBlock({
		count: 1,
		preferredBase: preferredBaseRaw ? Number(preferredBaseRaw) : undefined,
	});
	const url = `http://127.0.0.1:${port}`;

	// Spawn the preview server (`vite preview`) directly rather than through
	// `bun run preview`, so SIGTERM teardown does not surface a spurious
	// "script preview exited" wrapper error.
	const viteBin = path.join(webRoot, "node_modules/.bin/vite");
	const server: ChildProcess = spawn(viteBin, ["preview", "--host", "127.0.0.1", "--port", String(port)], {
		cwd: webRoot,
		stdio: "inherit",
		env: { ...process.env, FULCRUM_E2E: "1" },
	});

	// Track early death so the readiness loop fails fast instead of polling a
	// dead port for the full deadline (a crashed preview is a hard error, not a
	// "not ready yet").
	let serverExited: { code: number | null; signal: NodeJS.Signals | null } | null = null;
	server.once("exit", (code, signal) => {
		serverExited = { code, signal };
	});

	const stop = async (): Promise<void> => {
		if (server.exitCode !== null || server.signalCode !== null) return;
		await new Promise<void>((resolve) => {
			const timeout = setTimeout(() => {
				if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
				resolve();
			}, 5_000);
			server.once("exit", () => {
				clearTimeout(timeout);
				resolve();
			});
			if (!server.killed) server.kill("SIGTERM");
		});
	};

	// Poll until the preview server answers. Require two consecutive successful
	// probes before declaring ready, so a server that answers once and then
	// crashes (or is still warming up) is never handed to Playwright as ready —
	// the closure-review `ERR_CONNECTION_REFUSED` failure mode.
	const deadline = Date.now() + 60_000;
	let consecutiveOk = 0;
	while (Date.now() < deadline) {
		if (serverExited) {
			await stop();
			throw new Error(
				`design-e2e harness: preview server exited before becoming ready at ${url} ` +
					`(code ${serverExited.code ?? "null"}, signal ${serverExited.signal ?? "null"})`,
			);
		}
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
			if (response.status < 500) {
				consecutiveOk += 1;
				if (consecutiveOk >= 2) {
					return { url, port, stop };
				}
			} else {
				consecutiveOk = 0;
			}
		} catch {
			/* not up yet — retry */
			consecutiveOk = 0;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	await stop();
	throw new Error(`design-e2e harness: preview server did not become ready at ${url}`);
}

/**
 * Screenshot-capture phase: boot a real server, drive chromium over every
 * production route, capture one screenshot per route, tear everything down.
 */
async function captureProductionRoutes(webRoot: string): Promise<string[]> {
	const routes = enumerateDesignRoutes(path.join(webRoot, "src/routes"));
	console.log(`design-e2e harness: capturing ${routes.length} production route(s)`);

	rmSync(SCREENSHOT_DIR, { recursive: true, force: true });
	mkdirSync(SCREENSHOT_DIR, { recursive: true });

	// Build once, verified, before any server boots — same ordered contract the
	// spec phase uses.
	buildWebAppVerified(webRoot);
	const { url, stop } = await bootPreviewServer(webRoot);
	const browser = await chromium.launch();
	const artifacts: string[] = [];
	try {
		const context = await browser.newContext({ viewport: { ...DESKTOP_VIEWPORT } });
		const page = await context.newPage();
		for (const route of routes) {
			try {
				await page.goto(`${url}${route.path}`, { waitUntil: "load", timeout: 30_000 });
				await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {
					/* networkidle is best-effort; a streaming route may never idle */
				});
			} catch (error) {
				// Capturing a route is unconditional — a slow/erroring route still
				// gets whatever rendered so far.
				console.warn(`design-e2e harness: ${route.path} navigation incomplete — ${(error as Error).message}`);
			}
			const file = await captureScreenshot(page, route.slug);
			artifacts.push(file);
			console.log(`design-e2e harness: captured ${route.path} -> ${file}`);
		}
		await context.close();
	} finally {
		await browser.close();
		await stop();
	}
	return artifacts;
}

/** The design-e2e spec the harness runs by default — its own consumed-by proof. */
export const HARNESS_SPEC = "tests/design-e2e/harness.spec.ts";

/**
 * Cross-cutting accessibility specs the harness runs in the default gate.
 *
 * `prefers-reduced-motion` and `forced-colors` are foundation-token guarantees
 * in `DESIGN.md §1.6` / §3 lines 409-411 — every rendered shell must satisfy
 * them. They are therefore part of the default `test:design` gate, not opt-in
 * per-surface coverage. Owned by `prd-cross-a11y-motion-forced-colors`.
 */
export const ACCESSIBILITY_SPECS = [
	"tests/design-e2e/motion.spec.ts",
	"tests/design-e2e/forced-colors.spec.ts",
] as const;

/**
 * The wave-2 shell-presence design gate (`prd-design-gate-shell-assertions`).
 *
 * The harness itself (wave 0) is assertion-free — it boots a server and
 * captures screenshots but never asserts OD shell primitives, because those
 * are wave-1 deliverables. `shell-presence.spec.ts` is the shell-assertions
 * half of the split gate: it drives the six required production routes and
 * asserts StageRail / ScopeBar / StatusFooter / TraceBadge / AI Assist render.
 * It is part of the default `test:design` gate so a route that loses the OD
 * shell fails the gate — the gate is real and can self-resolve.
 */
export const SHELL_PRESENCE_SPEC = "tests/design-e2e/shell-presence.spec.ts";

/** The full default spec list `test:design` runs when no specs are requested. */
export const DEFAULT_DESIGN_SPECS: string[] = [HARNESS_SPEC, SHELL_PRESENCE_SPEC, ...ACCESSIBILITY_SPECS];

/**
 * Resolve the spec list for the spec-suite phase. When specs are passed
 * explicitly the harness runs exactly those (used by sibling PRDs to drive
 * specific design-e2e specs). With no args it runs the harness spec, the
 * wave-2 shell-presence gate (`shell-presence.spec.ts`), and the cross-cutting
 * reduced-motion + forced-colors specs — the foundation shell + accessibility
 * gate every rendered shell must pass (`DESIGN.md §1.6`, §3.1). The broader
 * per-surface OD-fidelity spec coverage is owned by those per-surface PRDs.
 */
function resolveSpecs(requestedSpecs: string[]): string[] {
	return requestedSpecs.length > 0 ? requestedSpecs : [...DEFAULT_DESIGN_SPECS];
}

/**
 * Spec-suite phase: run the design-e2e Playwright specs in chunks.
 *
 * Determinism contract (the closure-review `ERR_CONNECTION_REFUSED` /
 * `ERR_MODULE_NOT_FOUND` fix): the harness owns the build and the preview
 * server, Playwright does not. For each chunk:
 *
 *   1. `sweepOrphanPreviewServers` kills any preview process left by a crashed
 *      prior run and waits for it to die, so no orphan holds
 *      `.svelte-kit/output` handles during the rebuild.
 *   2. `buildWebAppVerified` produces a complete, verified `.svelte-kit/output`.
 *   3. `bootPreviewServer` starts `vite preview` and waits — with consecutive
 *      successful probes — until it is genuinely ready.
 *   4. Playwright runs with `FULCRUM_SKIP_DESIGN_E2E_SERVER=1`, so its
 *      `webServer` config skips its own `bun run build && bun run preview`
 *      entirely. Playwright never builds and never starts a server — it only
 *      connects to the harness-owned, already-verified-ready preview on the
 *      port the harness chose. That removes the build-vs-`webServer.timeout`
 *      race and the connect-before-ready race in one move.
 *   5. The harness tears its own preview down before the next chunk builds.
 */
async function runDesignSpecs(webRoot: string, requestedSpecs: string[]): Promise<void> {
	const playwrightCli = path.join(webRoot, "node_modules/@playwright/test/cli.js");

	const specs = resolveSpecs(requestedSpecs);

	const chunkSize = Number(process.env.FULCRUM_DESIGN_E2E_CHUNK_SIZE ?? "10");

	for (let index = 0; index < specs.length; index += chunkSize) {
		const chunk = specs.slice(index, index + chunkSize);
		const chunkNumber = Math.floor(index / chunkSize) + 1;
		console.log(`design-e2e chunk ${chunkNumber}: ${chunk.join(", ")}`);

		// Kill any orphaned preview server from a crashed prior run and wait for
		// it to die — an orphan holding `.svelte-kit/output` handles would race
		// the rebuild below.
		sweepOrphanPreviewServers(webRoot);

		// Build to a complete, verified output before any server boots.
		buildWebAppVerified(webRoot);

		// The harness owns the preview server — boot it and wait until ready.
		const { port, stop } = await bootPreviewServer(webRoot);
		let status: number | null;
		try {
			const result = spawnSync("node", [playwrightCli, "test", "--project=design-e2e", ...chunk], {
				cwd: webRoot,
				stdio: "inherit",
				env: {
					...process.env,
					FULCRUM_DESIGN_E2E_PORT: String(port),
					// Playwright must NOT start (or build for) its own design-e2e
					// server — the harness already booted a verified-ready one.
					FULCRUM_SKIP_DESIGN_E2E_SERVER: "1",
					FULCRUM_SKIP_REAL_E2E_SERVERS: "1",
				},
			});
			status = result.status;
		} finally {
			await stop();
		}
		if (status !== 0) {
			process.exit(status ?? 1);
		}
	}
}

/**
 * Source-contract phase: run the design-e2e `*.test.ts` files under `bun test`.
 *
 * These are deliberately NOT visual design tests — they are the regression
 * guard (`design-e2e-no-source-only.test.ts`, fails if a `.spec.ts` imports
 * `bun:test` without launching a page) and the architecture source-contract
 * checks (`web-source-contract.test.ts`, reads production CSS/config text). The
 * harness runs them as a clearly-labelled separate phase so test output
 * distinguishes source-contract checks from the rendered visual design specs.
 */
function runSourceContractTests(webRoot: string): void {
	const designE2eDir = path.join(webRoot, "tests/design-e2e");
	const contractTests = readdirSync(designE2eDir)
		.filter((name) => name.endsWith(".test.ts"))
		.sort()
		.map((name) => path.join("tests/design-e2e", name));

	if (contractTests.length === 0) return;

	console.log(`design-e2e SOURCE-CONTRACT phase (not visual design): ${contractTests.join(", ")}`);
	const result = spawnSync("bun", ["test", ...contractTests], {
		cwd: webRoot,
		stdio: "inherit",
		env: process.env,
	});
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

/**
 * Sweep any orphaned `vite preview` process left behind by a *crashed prior
 * harness run* for this web root, and wait until it is actually gone.
 *
 * An orphan that survives into the next run can hold open file handles inside
 * `.svelte-kit/output` while the new run's `rmSync` + `vite build` execute —
 * exactly the interleaving that produces a `manifest-full.js` referencing a
 * `nodes/<n>.js` the new build had not finished writing. `pkill` alone is
 * fire-and-forget; this helper sends SIGTERM, then SIGKILL, then polls
 * `pgrep` so the caller never starts a build against a live orphan.
 */
function sweepOrphanPreviewServers(webRoot: string): void {
	const patterns = [`${webRoot}.*bun run preview`, `${webRoot}.*vite preview`];
	const anyAlive = (): boolean =>
		patterns.some((pattern) => spawnSync("pgrep", ["-f", pattern], { stdio: "ignore" }).status === 0);

	if (!anyAlive()) return;

	for (const pattern of patterns) {
		spawnSync("pkill", ["-TERM", "-f", pattern], { stdio: "ignore" });
	}

	// Wait up to 5s for graceful exit, then escalate to SIGKILL and confirm.
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline && anyAlive()) {
		spawnSync("sleep", ["0.2"], { stdio: "ignore" });
	}
	if (anyAlive()) {
		for (const pattern of patterns) {
			spawnSync("pkill", ["-KILL", "-f", pattern], { stdio: "ignore" });
		}
		const killDeadline = Date.now() + 2_000;
		while (Date.now() < killDeadline && anyAlive()) {
			spawnSync("sleep", ["0.2"], { stdio: "ignore" });
		}
	}
}

async function main(): Promise<void> {
	const webRoot = process.cwd();
	const requestedSpecs = process.argv.slice(2).filter((arg) => arg !== "--specs-only" && arg !== "--capture-only");
	const captureOnly = process.argv.includes("--capture-only");
	const specsOnly = process.argv.includes("--specs-only");

	syncSvelteKitProjects(webRoot);

	if (!specsOnly) {
		const artifacts = await captureProductionRoutes(webRoot);
		console.log(`design-e2e harness: ${artifacts.length} screenshot artifact(s) under ${SCREENSHOT_DIR}`);
	}

	if (!captureOnly) {
		// Source-contract phase first: the regression guard fails fast if a
		// design-e2e spec went back to source-only assertions.
		runSourceContractTests(webRoot);

		console.log("design-e2e VISUAL DESIGN phase: rendered Playwright specs");
		// The harness owns build + preview per chunk; `runDesignSpecs` allocates
		// a fresh port for each chunk's `vite preview` inside `bootPreviewServer`.
		await runDesignSpecs(webRoot, requestedSpecs);
	}
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
