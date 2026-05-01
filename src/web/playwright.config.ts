import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const tempRoot = process.env.TMPDIR ?? "/tmp/fulcrum-e2e";
const fulcrumHome = path.join(tempRoot, `fulcrum-e2e-${process.pid}`);

export default defineConfig({
	testDir: "tests/e2e/",
	timeout: 30000,
	retries: 0,
	use: {
		baseURL: "http://127.0.0.1:5173",
	},
	webServer: {
		command: "bun run dev",
		port: 5173,
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
