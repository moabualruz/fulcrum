import { Injectable } from "@nestjs/common";

export interface ContextSummary {
  headings: string[];
  wikilinks: string[];
  mentions: string[];
}

@Injectable()
export class ContextSummaryExtractor {
  extractSummary(bodyMd: string): ContextSummary {
    return {
      headings: this.extractHeadings(bodyMd),
      wikilinks: this.extractWikilinks(bodyMd),
      mentions: this.extractMentions(bodyMd),
    };
  }

  private extractHeadings(md: string): string[] {
    const matches = md.matchAll(/^#{1,6}\s+(.+)$/gm);
    return [...matches].map((m) => m[1]!.trim());
  }

  private extractWikilinks(md: string): string[] {
    const matches = md.matchAll(/\[\[([^\]]+)\]\]/g);
    return [...matches].map((m) => m[1]!.trim());
  }

  private extractMentions(md: string): string[] {
    const matches = md.matchAll(/@([a-zA-Z0-9_-]+)/g);
    return [...matches].map((m) => m[1]!);
  }
}
