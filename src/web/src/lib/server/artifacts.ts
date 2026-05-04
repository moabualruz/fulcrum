/**
 * Re-export from canonical service layer.
 * Web consumers use $lib/server/artifacts — this file preserves that alias.
 * Actual logic lives in src/services/artifacts.ts.
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
} from "../../../../services/artifacts.ts";
