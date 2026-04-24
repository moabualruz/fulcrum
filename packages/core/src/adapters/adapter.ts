import type { AdapterMetadata, CapabilityHealthRecord, PolicyDecision } from "@fulcrum/shared";

export interface AdapterPreview {
  effects: string[];
  recordsAffected: string[];
  externalVisibility: "none" | "loopback" | "remote" | "public";
  policyRequirements: string[];
  redactionStatus: "not_applicable" | "not_redacted" | "redacted" | "needs_review";
  dataSharedExternally: string[];
}

export interface FulcrumAdapter<TInput = unknown, TResult = unknown> {
  metadata: AdapterMetadata;
  healthCheck(input?: TInput): Promise<CapabilityHealthRecord>;
  describeCapabilities(): Promise<{
    supported: string[];
    optional: string[];
    unavailable: string[];
    localFallback: string[];
    policyGated: string[];
  }>;
  preview(operation: string, input: TInput): Promise<AdapterPreview>;
  execute(
    operation: string,
    input: TInput,
    policyDecisionId?: string
  ): Promise<TResult | PolicyDecision>;
  disable(reason: string): Promise<void>;
  exportLocalState(scope: string): Promise<TResult>;
  rebuild(scope: string): Promise<TResult>;
}
