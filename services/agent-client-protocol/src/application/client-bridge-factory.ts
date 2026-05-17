import { AcpClientBridge, type AcpClientBridgeOptions } from "@agent-client-protocol/application/acp-bridge.ts";
import { ProcessTransport } from "@agent-client-protocol/application/transports/process.ts";
import { WebSocketTransport } from "@agent-client-protocol/application/transports/websocket.ts";
import { isRemoteConfig, isStdioConfig, type AgentConfig } from "@agent-client-protocol/domain/protocol.ts";

export interface CreateAcpClientBridgeOptions extends Omit<AcpClientBridgeOptions, "trafficRecorder"> {
  config: AgentConfig;
  trafficRecorder?: AcpClientBridgeOptions["trafficRecorder"];
  cwd?: string;
}

export async function createAcpClientBridge(options: CreateAcpClientBridgeOptions): Promise<AcpClientBridge> {
  const config = options.config;
  if (isRemoteConfig(config)) {
    if (config.transport === "http") throw new Error("ACP HTTP transport is not implemented");
    const transport = await WebSocketTransport.connect({ url: config.url, headers: config.headers });
    return new AcpClientBridge(transport, bridgeOptions(options));
  }

  if (isStdioConfig(config)) {
    const transport = ProcessTransport.start({
      command: config.command,
      args: config.args,
      env: config.env,
      cwd: options.cwd,
    });
    return new AcpClientBridge(transport, bridgeOptions(options));
  }

  throw new Error("ACP agent config must define either stdio command or remote url");
}

function bridgeOptions(options: CreateAcpClientBridgeOptions): AcpClientBridgeOptions {
  return {
    fsAvailable: options.fsAvailable,
    fileSystem: options.fileSystem,
    trafficRecorder: options.trafficRecorder,
    requestTimeoutMs: options.requestTimeoutMs,
  };
}
