import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { allocatePortBlock } from "./e2e-ports";
import { resolveRequestedE2eSpecs } from "./e2e-specs";

const requestedSpecs = process.argv.slice(2);
const resolved = resolveRequestedE2eSpecs(requestedSpecs);
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

syncUiKit();

if (resolved.project === "design-e2e") {
	const [designPortNumber] = await allocatePortBlock({
		count: 1,
		preferredBase: process.env.FULCRUM_DESIGN_E2E_PORT_BASE ? Number(process.env.FULCRUM_DESIGN_E2E_PORT_BASE) : undefined,
	});
	rmSync(path.join(process.cwd(), ".svelte-kit/output"), { recursive: true, force: true });
	const result = spawnSync("node", [playwrightCli, "test", "--project=design-e2e", ...resolved.specs], {
		stdio: "inherit",
		env: {
			...process.env,
			FULCRUM_DESIGN_E2E_PORT: String(designPortNumber),
			FULCRUM_SKIP_REAL_E2E_SERVERS: "1",
		},
	});
	process.exit(result.status ?? 1);
}

const [realPortNumber, serverPortNumber] = await allocatePortBlock({
	count: 2,
	preferredBase: process.env.FULCRUM_REAL_E2E_PORT_BASE ? Number(process.env.FULCRUM_REAL_E2E_PORT_BASE) : undefined,
});
const realPort = String(realPortNumber);
const serverPort = String(serverPortNumber);

const result = spawnSync("node", [playwrightCli, "test", "--project=real-e2e", ...resolved.specs], {
	stdio: "inherit",
	env: {
		...process.env,
		FULCRUM_REAL_E2E_PORT: realPort,
		FULCRUM_SERVER_TEST_PORT: serverPort,
		FULCRUM_SKIP_DESIGN_E2E_SERVER: "1",
	},
});

process.exit(result.status ?? 1);
