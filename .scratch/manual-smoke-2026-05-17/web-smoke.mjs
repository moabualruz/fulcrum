import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = "/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17";
const screenshots = join(root, "screenshots");
mkdirSync(screenshots, { recursive: true });

const routes = [
  { name: "dashboard", path: "/" },
  { name: "projects", path: "/projects" },
  { name: "project-new", path: "/projects/new" },
  { name: "docs", path: "/docs" },
  { name: "docs-global", path: "/docs/global" },
  { name: "search", path: "/search" },
  { name: "inbox", path: "/inbox" },
  { name: "runs", path: "/runs" },
  { name: "agents", path: "/agents" },
  { name: "planning", path: "/planning" },
  { name: "planning-sessions", path: "/planning/sessions" },
  { name: "repos", path: "/repos" },
  { name: "artifacts", path: "/artifacts" },
  { name: "audit", path: "/audit" },
  { name: "settings-flags", path: "/settings/flags" },
  { name: "settings-routing", path: "/settings/routing" },
  { name: "settings-connectors", path: "/settings/connectors" },
  { name: "settings-theme", path: "/settings/theme" },
  { name: "settings-api", path: "/settings/api" },
  { name: "doctor", path: "/doctor" },
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const results = [];

page.on("console", (msg) => {
  if (["error", "warning"].includes(msg.type())) {
    const current = results.at(-1);
    current?.console.push(`${msg.type()}: ${msg.text()}`);
  }
});
page.on("pageerror", (error) => {
  const current = results.at(-1);
  current?.pageErrors.push(error.message);
});

for (const route of routes) {
  const result = {
    ...route,
    url: `http://127.0.0.1:5173${route.path}`,
    status: null,
    finalUrl: null,
    title: "",
    headings: [],
    buttons: 0,
    links: 0,
    inputs: 0,
    textSample: "",
    screenshot: join(screenshots, `${route.name}.png`),
    console: [],
    pageErrors: [],
    issueHints: [],
  };
  results.push(result);
  try {
    const response = await page.goto(result.url, { waitUntil: "networkidle", timeout: 20000 });
    result.status = response?.status() ?? null;
    result.finalUrl = page.url();
    result.title = await page.title();
    await page.screenshot({ path: result.screenshot, fullPage: true });
    const snapshot = await page.evaluate(() => {
      const text = document.body.innerText.replace(/\s+/g, " ").trim();
      return {
        headings: [...document.querySelectorAll("h1,h2")].slice(0, 8).map((el) => el.textContent?.trim() ?? ""),
        buttons: document.querySelectorAll("button").length,
        links: document.querySelectorAll("a").length,
        inputs: document.querySelectorAll("input, textarea, select").length,
        textSample: text.slice(0, 900),
        hasMain: Boolean(document.querySelector("main")),
        unlabeledButtons: [...document.querySelectorAll("button")].filter((button) => {
          const name = button.textContent?.trim() || button.getAttribute("aria-label") || button.getAttribute("title");
          return !name;
        }).length,
      };
    });
    Object.assign(result, snapshot);
    if (result.status && result.status >= 400) result.issueHints.push(`HTTP ${result.status}`);
    if (!snapshot.hasMain) result.issueHints.push("missing <main>");
    if (snapshot.unlabeledButtons > 0) result.issueHints.push(`${snapshot.unlabeledButtons} unlabeled buttons`);
    if (result.textSample.toLowerCase().includes("internal error")) result.issueHints.push("internal error visible");
    if (result.textSample.toLowerCase().includes("not found")) result.issueHints.push("not found visible");
  } catch (error) {
    result.issueHints.push(`navigation failed: ${error.message}`);
    try {
      await page.screenshot({ path: result.screenshot, fullPage: true });
    } catch {}
  }
}

await context.close();

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const mobilePage = await mobile.newPage();
for (const route of [routes[0], routes[1], routes[3], routes[14]]) {
  const response = await mobilePage.goto(`http://127.0.0.1:5173${route.path}`, { waitUntil: "networkidle", timeout: 20000 }).catch(() => null);
  await mobilePage.screenshot({ path: join(screenshots, `${route.name}-mobile.png`), fullPage: true }).catch(() => {});
  results.push({
    name: `${route.name}-mobile`,
    path: route.path,
    status: response?.status?.() ?? null,
    screenshot: join(screenshots, `${route.name}-mobile.png`),
    issueHints: [],
  });
}
await mobile.close();
await browser.close();

writeFileSync(join(root, "web-smoke-results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({
  routes: results.length,
  failures: results.filter((result) => result.issueHints?.length || (result.status && result.status >= 400)).map((result) => ({
    name: result.name,
    status: result.status,
    issueHints: result.issueHints,
    screenshot: result.screenshot,
  })),
}, null, 2));
