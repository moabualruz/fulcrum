import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webRoot, "../..");
const tempRoot = process.env.TMPDIR ?? "/tmp/fulcrum-e2e";
const fulcrumHome = path.join(tempRoot, `fulcrum-e2e-${process.pid}`);
const designPort = Number(process.env.FULCRUM_DESIGN_E2E_PORT ?? "4200");
const realPort = Number(process.env.FULCRUM_REAL_E2E_PORT ?? process.env.FULCRUM_E2E_PORT ?? "5173");
const serverPort = Number(process.env.FULCRUM_SERVER_TEST_PORT ?? "3100");
const quotedWebRoot = JSON.stringify(webRoot);
const quotedRepoRoot = JSON.stringify(repoRoot);
const skipDesignE2eServer = process.env.FULCRUM_SKIP_DESIGN_E2E_SERVER === "1";
const skipRealE2eServers = process.env.FULCRUM_SKIP_REAL_E2E_SERVERS === "1";

export const PLAYWRIGHT_DOCKER_IMAGE = "mcr.microsoft.com/playwright:v1.50-jammy";

process.env.FULCRUM_HOME ??= fulcrumHome;

export default defineConfig({
	testDir: path.join(webRoot, "tests"),
	timeout: 30000,
	workers: 1,
	retries: 1,
	expect: {
		toHaveScreenshot: {
			maxDiffPixelRatio: 0.01,
			threshold: 0.2,
			animations: "disabled",
		},
	},
	use: {
		trace: "retain-on-failure",
	},
	webServer: [
		...skipDesignE2eServer ? [] : [{
			command: `cd ${quotedWebRoot} && bun run build && bun run preview -- --host 127.0.0.1 --port ${designPort}`,
			port: designPort,
			env: {
				FULCRUM_HOME: fulcrumHome,
				FULCRUM_ARTIFACT_STORE: path.join(fulcrumHome, "artifacts"),
				FULCRUM_E2E: "1",
			},
			reuseExistingServer: false,
		}],
		...skipRealE2eServers ? [] : [{
			command: `cd ${quotedRepoRoot} && bun run apps/server/src/index.ts`,
			port: serverPort,
			env: {
				FULCRUM_HOME: fulcrumHome,
				FULCRUM_SERVER_PORT: String(serverPort),
				PORT: String(serverPort),
				FULCRUM_FEATURES: "public-api",
				FULCRUM_E2E: "1",
			},
			reuseExistingServer: false,
		},
		{
			command: `cd ${quotedWebRoot} && bun run dev -- --host 127.0.0.1 --port ${realPort}`,
			port: realPort,
			env: {
				FULCRUM_HOME: fulcrumHome,
				FULCRUM_ARTIFACT_STORE: path.join(fulcrumHome, "artifacts"),
				FULCRUM_API_URL: `http://127.0.0.1:${serverPort}`,
				FULCRUM_E2E: "1",
			},
			reuseExistingServer: false,
		}],
	],
	projects: [
		{
			name: "design-e2e",
			testMatch: "design-e2e/**/*.spec.ts",
			use: {
				...devices["Desktop Chrome"],
				baseURL: `http://127.0.0.1:${designPort}`,
			},
		},
		{
			name: "real-e2e",
			testMatch: "e2e/**/*.spec.ts",
			use: {
				...devices["Desktop Chrome"],
				baseURL: `http://127.0.0.1:${realPort}`,
			},
		},
	],
});
