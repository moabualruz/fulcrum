/**
 * Platform domain repository barrel — Pillar 17 (cross-cutting).
 *
 * Backs platform-wide entities: encrypted credentials, telemetry events,
 * error log mirror, experiment assignments, feature-flag rollout policy.
 */

export { CredentialRepository } from "./CredentialRepository.ts";
export { TelemetryEventRepository } from "./TelemetryEventRepository.ts";
export { ErrorLogRepository } from "./ErrorLogRepository.ts";
export { ExperimentAssignmentRepository } from "./ExperimentAssignmentRepository.ts";
export { FeatureFlagRolloutRepository } from "./FeatureFlagRolloutRepository.ts";
