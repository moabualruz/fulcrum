/**
 * Re-export from canonical service layer.
 * Web consumers use $lib/server/artifacts: this file preserves that alias.
 * Actual logic lives in workflow coordination service modules.
 */
export {
  type ArtifactRow,
  type ArtifactFilter,
  type ArtifactStats,
  type ArtifactDetail,
  listArtifacts,
  readArtifactDetail,
  deleteArtifactAction,
  getArtifactStats,
} from "@workflow-coordination/interface/artifact-records.ts";
