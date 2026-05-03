/**
 * Platform domain entity barrel — Pillar 17 (cross-cutting).
 *
 * Cross-cutting platform tables consumed by every pillar:
 *   - Credential          — encrypted secret store (always-on local)
 *   - TelemetryEvent      — opt-in usage telemetry
 *   - ErrorLog            — crashlog mirror for `errors.list/get` surfaces
 *   - ExperimentAssignment — A/B variant assignments
 *   - FeatureFlagRollout  — per-flag rollout %/cohort policy outside Pillar 1
 */

export { Credential } from "./Credential.ts";
export { TelemetryEvent } from "./TelemetryEvent.ts";
export { ErrorLog } from "./ErrorLog.ts";
export { ExperimentAssignment } from "./ExperimentAssignment.ts";
export { FeatureFlagRollout } from "./FeatureFlagRollout.ts";
export { TelemetryOutbox } from "./TelemetryOutbox.ts";
