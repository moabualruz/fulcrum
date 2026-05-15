import { getTransportKind, type AgentConfig, type AgentTransportKind, type AgentsConfig } from "@agent-client-protocol/domain/protocol.ts";

export interface AcpConfigStateOptions {
  config?: AgentsConfig;
  configPath?: string;
  loading?: boolean;
  error?: string | null;
  restrictedTransports?: boolean;
}

export interface AcpConfigState {
  config: AgentsConfig;
  configPath: string;
  loading: boolean;
  error: string | null;
  restrictedTransports: boolean;
  readonly allAgentNames: string[];
  readonly agentNames: string[];
  readonly stdioAgentNames: string[];
  readonly remoteAgentNames: string[];
  readonly hasAgents: boolean;
  getAgentTransportKind(name: string): AgentTransportKind;
  getAgent(name: string): AgentConfig | undefined;
  updateFromEvent(newConfig: AgentsConfig): void;
  clearError(): void;
}

class MutableAcpConfigState implements AcpConfigState {
  config: AgentsConfig;
  configPath: string;
  loading: boolean;
  error: string | null;
  restrictedTransports: boolean;

  constructor(options: AcpConfigStateOptions = {}) {
    this.config = options.config ?? { agents: {} };
    this.configPath = options.configPath ?? "";
    this.loading = options.loading ?? false;
    this.error = options.error ?? null;
    this.restrictedTransports = options.restrictedTransports ?? false;
  }

  get allAgentNames(): string[] {
    return Object.keys(this.config.agents);
  }

  get agentNames(): string[] {
    if (!this.restrictedTransports) return this.allAgentNames;
    return this.allAgentNames.filter((name) => getTransportKind(this.config.agents[name] ?? {}) !== "stdio");
  }

  get stdioAgentNames(): string[] {
    return this.allAgentNames.filter((name) => getTransportKind(this.config.agents[name] ?? {}) === "stdio");
  }

  get remoteAgentNames(): string[] {
    return this.allAgentNames.filter((name) => {
      const kind = getTransportKind(this.config.agents[name] ?? {});
      return kind === "websocket" || kind === "http";
    });
  }

  get hasAgents(): boolean {
    return this.agentNames.length > 0;
  }

  getAgentTransportKind(name: string): AgentTransportKind {
    const config = this.config.agents[name];
    return config ? getTransportKind(config) : "stdio";
  }

  getAgent(name: string): AgentConfig | undefined {
    return this.config.agents[name];
  }

  updateFromEvent(newConfig: AgentsConfig): void {
    this.config = newConfig;
  }

  clearError(): void {
    this.error = null;
  }
}

export function createAcpConfigState(options: AcpConfigStateOptions = {}): AcpConfigState {
  return new MutableAcpConfigState(options);
}
