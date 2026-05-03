import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

const SEARCH_KINDS = ["tasks", "docs", "memories", "runs", "artifacts"] as const;

export type TuiSearchKind = (typeof SEARCH_KINDS)[number];

export interface TuiSearchResult {
  id: string;
  kind: TuiSearchKind;
  title: string;
  subtitle?: string | null;
}

export interface SearchScreenOptions {
  caller: {
    search: {
      query: (input: { query: string; facets: TuiSearchKind[] }) => Promise<TuiSearchResult[]>;
    };
  };
  onOpenEntity?: (entity: { kind: TuiSearchKind; id: string }) => void;
}

export class SearchScreen {
  private query = "";
  private results: TuiSearchResult[] = [];
  private enabledFacets = new Set<TuiSearchKind>(SEARCH_KINDS);
  private focusedFacet = 0;
  private cursor = 0;

  constructor(private readonly opts: SearchScreenOptions) {}

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Search"));
    renderer.separator();
    renderer.writeln(`  Query: ${this.query || c.dim("(empty)")}`);
    renderer.writeln();
    renderer.writeln(`  Facets: ${SEARCH_KINDS.map((kind, index) => this.renderFacet(kind, index)).join(" ")}`);
    renderer.writeln();

    for (const kind of SEARCH_KINDS) {
      const results = this.results.filter((result) => result.kind === kind);
      if (results.length === 0) continue;
      renderer.writeln(c.bold(`  ${kind}`));
      for (const result of results) {
        const index = this.results.indexOf(result);
        const pointer = index === this.cursor ? c.bold(">") : " ";
        const subtitle = result.subtitle ? `  ${c.dim(result.subtitle)}` : "";
        renderer.writeln(`${pointer} ${result.title}${subtitle}`);
      }
      renderer.writeln();
    }

    if (this.results.length === 0) renderer.writeln(c.dim("  No results."));

    renderer.writeln();
    renderer.writeln(c.dim("  Tab facet  Space toggle  Enter open  q back"));
  }

  async submitQuery(query: string): Promise<void> {
    this.query = query;
    this.results = await this.opts.caller.search.query({ query, facets: this.activeFacets });
    this.cursor = 0;
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "\t") {
      this.focusedFacet = (this.focusedFacet + 1) % SEARCH_KINDS.length;
      return true;
    }

    if (key === " ") {
      const kind = SEARCH_KINDS[this.focusedFacet];
      if (this.enabledFacets.has(kind)) this.enabledFacets.delete(kind);
      else this.enabledFacets.add(kind);
      return true;
    }

    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.results.length - 1));
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }

    if (key === "\r") {
      const result = this.results[this.cursor];
      if (!result) return false;
      this.opts.onOpenEntity?.({ kind: result.kind, id: result.id });
      return true;
    }

    return false;
  }

  private get activeFacets(): TuiSearchKind[] {
    return SEARCH_KINDS.filter((kind) => this.enabledFacets.has(kind));
  }

  private renderFacet(kind: TuiSearchKind, index: number): string {
    const checked = this.enabledFacets.has(kind) ? "x" : " ";
    const label = `[${checked}] ${kind}`;
    return index === this.focusedFacet ? c.bold(label) : label;
  }
}
