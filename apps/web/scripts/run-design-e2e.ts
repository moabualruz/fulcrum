import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const specDir = path.join(process.cwd(), "tests/design-e2e");
const svelteKitOutputDir = path.join(process.cwd(), ".svelte-kit/output");
const webRoot = process.cwd();
const playwrightCli = path.join(webRoot, "node_modules/@playwright/test/cli.js");

function stopDesignProcesses(port?: string): void {
	const patterns = [
		port ? `${webRoot}.*bun run build.*bun run preview.*${port}` : `${webRoot}.*bun run build.*bun run preview`,
		port ? `${webRoot}.*bun run preview.*${port}` : `${webRoot}.*bun run preview`,
		port ? `${webRoot}.*vite preview.*${port}` : `${webRoot}.*vite preview`,
		`${webRoot}.*vite build`,
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

const chunkSize = Number(process.env.FULCRUM_DESIGN_E2E_CHUNK_SIZE ?? "1");
const basePort = Number(process.env.FULCRUM_DESIGN_E2E_PORT_BASE ?? String(12000 + (process.pid % 100) * 100));

for (let index = 0; index < specs.length; index += chunkSize) {
	const chunk = specs.slice(index, index + chunkSize);
	const chunkNumber = Math.floor(index / chunkSize) + 1;
	const designPort = String(basePort + chunkNumber - 1);
	console.log(`design-e2e chunk ${chunkNumber}: ${chunk.join(", ")}`);
	stopDesignProcesses();
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
