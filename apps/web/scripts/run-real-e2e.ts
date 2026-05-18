import { spawnSync } from "node:child_process";
import path from "node:path";
import { allocatePortBlock } from "./e2e-ports";

const [realPortNumber, serverPortNumber] = await allocatePortBlock({
	count: 2,
	preferredBase: process.env.FULCRUM_REAL_E2E_PORT_BASE ? Number(process.env.FULCRUM_REAL_E2E_PORT_BASE) : undefined,
});
const realPort = String(realPortNumber);
const serverPort = String(serverPortNumber);
const requestedSpecs = process.argv.slice(2);
const specs = requestedSpecs.length > 0 ? requestedSpecs : ["tests/e2e/wave-0a-foundation.spec.ts"];
const playwrightCli = path.join(process.cwd(), "node_modules/@playwright/test/cli.js");

const result = spawnSync("node", [playwrightCli, "test", "--project=real-e2e", ...specs], {
	stdio: "inherit",
	env: {
		...process.env,
		FULCRUM_REAL_E2E_PORT: realPort,
		FULCRUM_SERVER_TEST_PORT: serverPort,
		FULCRUM_SKIP_DESIGN_E2E_SERVER: "1",
	},
});

process.exit(result.status ?? 1);
