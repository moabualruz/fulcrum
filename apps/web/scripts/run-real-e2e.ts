import { spawnSync } from "node:child_process";

const basePort = Number(process.env.FULCRUM_REAL_E2E_PORT_BASE ?? String(22000 + (process.pid % 100) * 10));
const realPort = String(basePort);
const serverPort = String(basePort + 1);

const result = spawnSync("playwright", ["test", "tests/e2e/wave-0a-foundation.spec.ts", "--project=real-e2e"], {
	stdio: "inherit",
	env: {
		...process.env,
		FULCRUM_REAL_E2E_PORT: realPort,
		FULCRUM_SERVER_TEST_PORT: serverPort,
		FULCRUM_SKIP_DESIGN_E2E_SERVER: "1",
	},
});

process.exit(result.status ?? 1);
