export interface AppContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export interface ArtifactDto {
  id: string;
  orgId: string;
  filename: string;
  path: string;
  mime: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateArtifactInput {
  filename: string;
  path: string;
  mime?: string | null;
  metadataJson?: Record<string, unknown>;
}
