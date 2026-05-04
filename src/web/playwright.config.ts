import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const tempRoot = process.env.TMPDIR ?? "/tmp/fulcrum-e2e";
const fulcrumHome = path.join(tempRoot, `fulcrum-e2e-${process.pid}`);
const port = Number(process.env.FULCRUM_E2E_PORT ?? "5173");

export default defineConfig({
	testDir: "tests/",
	timeout: 30000,
	retries: 0,
	use: {
		baseURL: `http://127.0.0.1:${port}`,
	},
	webServer: {
		command: `bun run dev -- --host 127.0.0.1 --port ${port}`,
		port,
		env: {
			FULCRUM_HOME: fulcrumHome,
		},
		reuseExistingServer: false,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
