import type { SearchQueryInput, SearchQueryOutput } from "../../../../../search/query";

export interface CmdkSearchResult {
  id: string;
  kind: string;
  entityId: string;
  title: string;
  href: string;
  badge?: string;
  breadcrumb?: string;
  updatedAt?: string | Date;
}

export interface CmdkSearchOutput extends Omit<SearchQueryOutput, "results"> {
  results: CmdkSearchResult[];
}

export interface CmdkSearchClient {
  query(input: SearchQueryInput): Promise<CmdkSearchOutput>;
}

export interface CmdkCommand {
  name: string;
  label: string;
  handler: () => void;
}

export class CmdkPaletteCache {
  private readonly entries = new Map<string, CmdkSearchOutput>();

  async query(input: SearchQueryInput, fetcher: () => Promise<CmdkSearchOutput>): Promise<CmdkSearchOutput> {
    const key = JSON.stringify({
      orgId: input.orgId,
      q: input.q?.trim() ?? "",
      kind: input.kind,
      projectId: input.projectId,
      status: input.status,
      assigneeId: input.assigneeId,
      tags: input.tags,
    });
    const hit = this.entries.get(key);
    if (hit) return hit;

    const value = await fetcher();
    this.entries.set(key, value);
    return value;
  }
}
