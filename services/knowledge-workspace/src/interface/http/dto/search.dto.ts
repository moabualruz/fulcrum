export class SearchQueryDto {
  q!: string;
  org_id!: string;
  project_id?: string;
  kind?: string;
  limit?: number | string;
}

export class SearchSuggestQueryDto {
  prefix!: string;
  org_id!: string;
  kind?: string;
  limit?: number | string;
}

export class SearchListSavedQueryDto {
  org_id!: string;
  user_id!: string;
}

export class SearchCreateSavedRequestDto {
  org_id!: string;
  user_id!: string;
  name!: string;
  query_json!: Record<string, unknown>;
  scope!: "private" | "project" | "org";
  project_id?: string;
}

export class SearchSavedIdParamsDto {
  id!: string;
}

export class SearchUpdateSavedRequestDto {
  org_id!: string;
  user_id!: string;
  name?: string;
  query_json?: Record<string, unknown>;
  scope?: "private" | "project" | "org";
  project_id?: string;
}

export class SearchDeleteSavedQueryDto {
  org_id!: string;
  user_id!: string;
}

export class SearchClickBodyDto {
  org_id!: string;
  user_id!: string;
  project_id?: string;
  query!: string;
  result_id!: string;
  result_kind!: string;
  position?: number | string;
}

export class SearchSnapshotQueryDto {
  org_id!: string;
  project_id?: string;
}

export class SearchSuggestionsResponseDto {
  suggestions!: string[];
}
