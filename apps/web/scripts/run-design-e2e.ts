import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { allocatePortBlock } from "./e2e-ports";

const specDir = path.join(process.cwd(), "tests/design-e2e");
const svelteKitOutputDir = path.join(process.cwd(), ".svelte-kit/output");
const webRoot = process.cwd();
const repoRoot = path.resolve(webRoot, "../..");
const playwrightCli = path.join(webRoot, "node_modules/@playwright/test/cli.js");
const uiKitRoot = path.join(repoRoot, "packages/ui-kit");

function syncUiKit(): void {
	const result = spawnSync("bun", ["x", "svelte-kit", "sync"], {
		cwd: uiKitRoot,
		stdio: "inherit",
		env: process.env,
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

function stopDesignProcesses(port?: string): void {
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
const requestedSpecs = process.argv.slice(2);
const specs =
	requestedSpecs.length > 0
		? requestedSpecs
		: readdirSync(specDir)
				.filter((file) => file.endsWith(".spec.ts"))
				.sort()
				.map((file) => path.join("tests/design-e2e", file));

const chunkSize = Number(process.env.FULCRUM_DESIGN_E2E_CHUNK_SIZE ?? String(specs.length || 1));
const chunkCount = Math.ceil(specs.length / chunkSize);
const designPorts = await allocatePortBlock({
	count: chunkCount,
	preferredBase: process.env.FULCRUM_DESIGN_E2E_PORT_BASE ? Number(process.env.FULCRUM_DESIGN_E2E_PORT_BASE) : undefined,
});

syncUiKit();

for (let index = 0; index < specs.length; index += chunkSize) {
	const chunk = specs.slice(index, index + chunkSize);
	const chunkNumber = Math.floor(index / chunkSize) + 1;
	const designPort = String(designPorts[chunkNumber - 1]);
	console.log(`design-e2e chunk ${chunkNumber}: ${chunk.join(", ")}`);
	if (chunkCount > 1) stopDesignProcesses(designPort);
	rmSync(svelteKitOutputDir, { recursive: true, force: true });
	const result = spawnSync("node", [playwrightCli, "test", "--project=design-e2e", ...chunk], {
		stdio: "inherit",
		env: {
			...process.env,
			FULCRUM_DESIGN_E2E_PORT: designPort,
			FULCRUM_SKIP_REAL_E2E_SERVERS: "1",
		},
	});
	stopDesignProcesses(designPort);

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}
