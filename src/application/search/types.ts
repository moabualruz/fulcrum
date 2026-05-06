export interface SearchApplicationContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export interface SearchHit {
  id: string;
  source_kind: string;
  source_id: string;
  title: string;
  body: string;
  score: number;
  updated_at: string;
}

export interface SearchFilters {
  orgId: string;
  projectId?: string | null;
  sourceKinds?: readonly string[];
  limit?: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  params: SearchParams;
}

export interface SearchParams {
  q: string;
  kinds: string[];
  dateFrom: string;
  dateTo: string;
}
