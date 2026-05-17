export const SAVED_VIEW_SCOPES = ["private", "project", "org"] as const;
export const SAVED_VIEW_TYPES = ["kanban", "table", "calendar", "timeline", "list"] as const;

export type PublicSavedViewScope = (typeof SAVED_VIEW_SCOPES)[number];
export type PublicSavedViewType = (typeof SAVED_VIEW_TYPES)[number];

export class SavedViewListQueryDto {
  orgId?: string;
  projectId?: string;
}

export class CreateSavedViewBodyDto {
  orgId!: string;
  projectId?: string;
  name!: string;
  scope?: PublicSavedViewScope;
  viewType?: PublicSavedViewType;
  filters?: Record<string, unknown>;
  sortBy?: string | null;
  isDefault?: boolean;
}

export class SavedViewIdParamsDto {
  id!: string;
}

export class PatchSavedViewBodyDto {
  name?: string;
  scope?: PublicSavedViewScope;
  viewType?: PublicSavedViewType;
  filters?: Record<string, unknown>;
  sortBy?: string | null;
  isDefault?: boolean;
}
