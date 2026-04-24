import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createMcpResourceDefinitions, type McpResourceRuntime } from "./resources.js";
import { createMcpToolDefinitions, type McpToolRuntime } from "./tools.js";

export interface FulcrumMcpRuntime extends McpToolRuntime, McpResourceRuntime {}

export function createFulcrumMcpServer(runtime: FulcrumMcpRuntime): McpServer {
  const server = new McpServer({ name: "fulcrum", version: "0.1.0" });
  const tools = createMcpToolDefinitions(runtime);

  for (const definition of tools) {
    const register = (name: string) =>
      server.registerTool(
        name,
        {
          title: name,
          description: definition.description,
          inputSchema: definition.inputSchema as z.AnyZodObject
        },
        async (args: unknown): Promise<CallToolResult> => {
          const response = await definition.execute(args);
          return {
            content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
            structuredContent: response as unknown as Record<string, unknown>,
            isError: response.status === "error"
          };
        }
      );
    register(definition.name);
    for (const alias of definition.aliases) register(alias);
  }

  for (const resource of createMcpResourceDefinitions(runtime)) {
    const config = {
      title: resource.name,
      description: resource.description,
      mimeType: "application/json"
    };
    const read = async (uri: URL): Promise<ReadResourceResult> => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(await resource.read(uri), null, 2)
        }
      ]
    });
    if (resource.uri.includes("{")) {
      server.registerResource(
        resource.name,
        new ResourceTemplate(resource.uri, { list: undefined }),
        config,
        async (uri) => read(uri)
      );
    } else {
      server.registerResource(resource.name, resource.uri, config, read);
    }
  }

  return server;
}

export async function runFulcrumMcpStdio(runtime: FulcrumMcpRuntime): Promise<void> {
  const server = createFulcrumMcpServer(runtime);
  await server.connect(new StdioServerTransport());
}
