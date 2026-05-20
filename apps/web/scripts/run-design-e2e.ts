/**
 * Rendered-screenshot design-gate harness.
 *
 * Two responsibilities, both run only when this file is the process entrypoint:
 *   1. Screenshot-capture phase — build the web app, boot a real preview
 *      server, drive Playwright chromium over every production route the
 *      harness enumerates (at minimum `/`), capture one desktop-viewport
 *      screenshot per route, then tear the browser + server down cleanly.
 *   2. Spec-suite phase — run the design-e2e Playwright specs (including
 *      `harness.spec.ts`) against the chunked Playwright `webServer` setup.
 *
 * `captureScreenshot` is exported as a side-effect-free helper so design-e2e
 * specs can import it directly — proving the harness is consumed, not dead.
 * Importing this module never boots a server or a browser; only running it as
 * the entrypoint does (guarded by `import.meta.main`). Capturing a route is
 * unconditional: the harness never hard-fails because an OD shell primitive is
 * absent — asserting StageRail / ScopeBar / StatusFooter presence is OUT OF
 * SCOPE here and owned by `prd-design-gate-shell-assertions`.
 */
import { mkdirSync, readdirSync, rmSync } from "node:fs";
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
	stop: () => void;
}

/** Build the web app and boot a real preview server on an allocated port. */
async function bootPreviewServer(webRoot: string): Promise<BootedServer> {
	const build = spawnSync("bun", ["run", "build"], { cwd: webRoot, stdio: "inherit", env: process.env });
	if (build.status !== 0) {
		throw new Error(`design-e2e harness: web build failed (exit ${build.status ?? "unknown"})`);
	}

	const [port] = await allocatePortBlock({
		count: 1,
		preferredBase: process.env.FULCRUM_DESIGN_E2E_CAPTURE_PORT_BASE
			? Number(process.env.FULCRUM_DESIGN_E2E_CAPTURE_PORT_BASE)
			: undefined,
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

	const stop = (): void => {
		if (!server.killed) server.kill("SIGTERM");
	};

	// Poll until the preview server answers, then the harness can navigate it.
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
			if (response.status < 500) {
				return { url, stop };
			}
		} catch {
			/* not up yet — retry */
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	stop();
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
		stop();
	}
	return artifacts;
}

/** The design-e2e spec the harness runs by default — its own consumed-by proof. */
export const HARNESS_SPEC = "tests/design-e2e/harness.spec.ts";

/**
 * Resolve the spec list for the spec-suite phase. When specs are passed
 * explicitly the harness runs exactly those (used by sibling PRDs to drive
 * specific design-e2e specs). With no args it runs only `harness.spec.ts` — a
 * green, harness-scoped rendering gate wave-1 shell/stage PRDs prove against.
 * The broader OD-fidelity spec coverage is owned by those per-surface PRDs,
 * not by this wave-0 harness PRD.
 */
function resolveSpecs(requestedSpecs: string[]): string[] {
	return requestedSpecs.length > 0 ? requestedSpecs : [HARNESS_SPEC];
}

/** Spec-suite phase: run the design-e2e Playwright specs in chunks. */
function runDesignSpecs(webRoot: string, requestedSpecs: string[], designPorts: number[]): void {
	const playwrightCli = path.join(webRoot, "node_modules/@playwright/test/cli.js");
	const svelteKitOutputDir = path.join(webRoot, ".svelte-kit/output");

	const specs = resolveSpecs(requestedSpecs);

	const chunkSize = Number(process.env.FULCRUM_DESIGN_E2E_CHUNK_SIZE ?? "10");
	const chunkCount = Math.ceil(specs.length / chunkSize);

	for (let index = 0; index < specs.length; index += chunkSize) {
		const chunk = specs.slice(index, index + chunkSize);
		const chunkNumber = Math.floor(index / chunkSize) + 1;
		const designPort = String(designPorts[chunkNumber - 1]);
		console.log(`design-e2e chunk ${chunkNumber}: ${chunk.join(", ")}`);
		if (chunkCount > 1) stopDesignProcesses(webRoot, designPort);
		rmSync(svelteKitOutputDir, { recursive: true, force: true });
		const result = spawnSync("node", [playwrightCli, "test", "--project=design-e2e", ...chunk], {
			cwd: webRoot,
			stdio: "inherit",
			env: {
				...process.env,
				FULCRUM_DESIGN_E2E_PORT: designPort,
				FULCRUM_SKIP_REAL_E2E_SERVERS: "1",
			},
		});
		stopDesignProcesses(webRoot, designPort);
		if (result.status !== 0) {
			process.exit(result.status ?? 1);
		}
	}
}

function stopDesignProcesses(webRoot: string, port?: string): void {
	const patterns = [
		`${webRoot}.*bun run build.*bun run preview`,
		`${webRoot}.*bun run build`,
		`${webRoot}.*vite build`,
		port ? `${webRoot}.*bun run preview.*${port}` : `${webRoot}.*bun run preview`,
		port ? `${webRoot}.*vite preview.*${port}` : `${webRoot}.*vite preview`,
	].filter((pattern): pattern is string => Boolean(pattern));
	for (const pattern of patterns) {
		spawnSync("pkill", ["-TERM", "-f", pattern], { stdio: "ignore" });
	}
}

function syncUiKit(webRoot: string): void {
	const uiKitRoot = path.resolve(webRoot, "../../packages/ui-kit");
	const result = spawnSync("bun", ["x", "svelte-kit", "sync"], { cwd: uiKitRoot, stdio: "inherit", env: process.env });
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

async function main(): Promise<void> {
	const webRoot = process.cwd();
	const requestedSpecs = process.argv.slice(2).filter((arg) => arg !== "--specs-only" && arg !== "--capture-only");
	const captureOnly = process.argv.includes("--capture-only");
	const specsOnly = process.argv.includes("--specs-only");

	syncUiKit(webRoot);

	if (!specsOnly) {
		const artifacts = await captureProductionRoutes(webRoot);
		console.log(`design-e2e harness: ${artifacts.length} screenshot artifact(s) under ${SCREENSHOT_DIR}`);
	}

	if (!captureOnly) {
		const specCount = resolveSpecs(requestedSpecs).length;
		const chunkSize = Number(process.env.FULCRUM_DESIGN_E2E_CHUNK_SIZE ?? "10");
		const designPorts = await allocatePortBlock({
			count: Math.max(1, Math.ceil(specCount / chunkSize)),
			preferredBase: process.env.FULCRUM_DESIGN_E2E_PORT_BASE
				? Number(process.env.FULCRUM_DESIGN_E2E_PORT_BASE)
				: undefined,
		});
		runDesignSpecs(webRoot, requestedSpecs, designPorts);
	}
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
