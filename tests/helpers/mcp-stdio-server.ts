import { runFulcrumMcpStdio } from "@fulcrum/mcp";
import { createTestMcpRuntime } from "./mcp-runtime.js";

const root = process.argv[2];

if (!root) {
  throw new Error("Fixture root path required.");
}

await runFulcrumMcpStdio(createTestMcpRuntime(root));
