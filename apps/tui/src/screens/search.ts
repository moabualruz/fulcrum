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
      query: (input: { query: string; facets: TuiSearchKind[]; scope: TuiSearchScope }) => Promise<TuiSearchResult[]>;
      suggest?: (input: { query: string }) => Promise<string[]>;
    };
  };
  onOpenEntity?: (entity: { kind: TuiSearchKind; id: string }) => void;
}

export type TuiSearchScope = "current" | "all" | "global";

export class SearchScreen {
  private query = "";
  private results: TuiSearchResult[] = [];
  private paletteQuery = "";
  private paletteResults: TuiSearchResult[] = [];
  private enabledFacets = new Set<TuiSearchKind>(SEARCH_KINDS);
  private focusedFacet = 0;
  private scope: TuiSearchScope = "current";
  private cursor = 0;
  private paletteCursor = 0;
  private paletteOpen = false;
  private fullScreen = false;

  constructor(private readonly opts: SearchScreenOptions) {}

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold(this.fullScreen ? "  Full-screen search" : "  Search"));
    renderer.separator();
    renderer.writeln(`  Query: ${this.query || c.dim("(empty)")}`);
    renderer.writeln(`  Scope: ${this.scopeLabel}`);
    renderer.writeln();
    renderer.writeln(`  Facets: ${SEARCH_KINDS.map((kind, index) => this.renderFacet(kind, index)).join(" ")}`);
    renderer.writeln();
    renderer.writeln(c.bold(`  Results (${this.results.length})`));
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
    renderer.writeln(c.dim("  Cmd+K palette  S full search  g scope  Tab facet  Space toggle  Enter open  q back"));

    if (this.paletteOpen) this.renderPalette(renderer);
  }

  async submitQuery(query: string): Promise<void> {
    this.query = query;
    this.results = await this.opts.caller.search.query({ query, facets: this.activeFacets, scope: this.scope });
    this.cursor = 0;
  }

  async submitPaletteQuery(query: string): Promise<void> {
    this.paletteQuery = query;
    this.paletteResults = await this.opts.caller.search.query({ query, facets: [...SEARCH_KINDS], scope: this.scope });
    this.paletteCursor = 0;
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "\x0b") {
      this.paletteOpen = true;
      this.paletteCursor = 0;
      return true;
    }

    if (this.paletteOpen) return this.handlePaletteKey(key);

    if (key === "S") {
      this.fullScreen = true;
      return true;
    }

    if (key === "\t") {
      this.focusedFacet = (this.focusedFacet + 1) % SEARCH_KINDS.length;
      return true;
    }

    if (key === "g") {
      this.scope = this.nextScope();
      if (this.query) await this.submitQuery(this.query);
      return true;
    }

    if (key === " ") {
      const kind = SEARCH_KINDS[this.focusedFacet];
      if (!kind) return false;
      if (this.enabledFacets.has(kind)) this.enabledFacets.delete(kind);
      else this.enabledFacets.add(kind);
      if (this.query) await this.submitQuery(this.query);
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
      // P11#16: record click telemetry
      this.maybeRecordClick(result, this.cursor);
      this.opts.onOpenEntity?.({ kind: result.kind, id: result.id });
      return true;
    }

    return false;
  }

  private maybeRecordClick(result: TuiSearchResult, position: number): void {
    if (
      !(process.env["FULCRUM_FEATURES"] ?? "")
        .split(",")
        .map((f) => f.trim())
        .includes("search-click-telemetry")
    )
      return;
    // Fire-and-forget; telemetry should not block UI
    const caller = this.opts.caller as { search: { recordClick?: (input: unknown) => Promise<unknown> } };
    caller.search.recordClick?.({
      query: this.query,
      resultKind: result.kind,
      resultId: result.id,
      position,
    }).catch(() => {});
  }

  private get activeFacets(): TuiSearchKind[] {
    return SEARCH_KINDS.filter((kind) => this.enabledFacets.has(kind));
  }

  private get scopeLabel(): string {
    if (this.scope === "all") return "All projects";
    if (this.scope === "global") return "Global only";
    return "Current project";
  }

  private nextScope(): TuiSearchScope {
    if (this.scope === "current") return "all";
    if (this.scope === "all") return "global";
    return "current";
  }

  private renderFacet(kind: TuiSearchKind, index: number): string {
    const checked = this.enabledFacets.has(kind) ? "x" : " ";
    const label = `[${checked}] ${kind}`;
    return index === this.focusedFacet ? c.bold(label) : label;
  }

  private renderPalette(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Command palette"));
    renderer.writeln(`  ${this.paletteQuery.startsWith(">") ? "Command" : "Search"}: ${this.paletteQuery || c.dim("(empty)")}`);

    if (this.paletteResults.length === 0) {
      renderer.writeln(c.dim("  No results."));
      return;
    }

    for (const [index, result] of this.paletteResults.entries()) {
      const pointer = index === this.paletteCursor ? c.bold(">") : " ";
      const subtitle = result.subtitle ? `  ${c.dim(result.subtitle)}` : "";
      renderer.writeln(`${pointer} ${result.title}  ${c.dim(result.kind)}${subtitle}`);
    }
  }

  private handlePaletteKey(key: string): boolean {
    if (key === "\x1b") {
      this.paletteOpen = false;
      this.paletteQuery = "";
      this.paletteResults = [];
      this.paletteCursor = 0;
      return true;
    }

    if (key === "j" || key === "\x1b[B") {
      this.paletteCursor = Math.min(this.paletteCursor + 1, Math.max(0, this.paletteResults.length - 1));
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.paletteCursor = Math.max(0, this.paletteCursor - 1);
      return true;
    }

    if (key === "\r") {
      const result = this.paletteResults[this.paletteCursor];
      if (!result) return false;
      this.opts.onOpenEntity?.({ kind: result.kind, id: result.id });
      this.paletteOpen = false;
      return true;
    }

    return false;
  }
}
