/**
 * Confluence Cloud REST v2 API client.
 * Fetches pages from a space, paginated.
 */

export interface ConfluencePage {
  id: string;
  title: string;
  body: { storage: { value: string } };
}

export interface ConfluenceApiResponse {
  results: ConfluencePage[];
  start: number;
  limit: number;
  size: number;
  _links?: { next?: string };
}

export interface ConfluenceClientConfig {
  baseUrl: string;
  apiToken: string;
  userEmail?: string;
}

export class ConfluenceClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: ConfluenceClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    const auth = Buffer.from(`${config.userEmail ?? ""}:${config.apiToken}`).toString("base64");
    this.headers = {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    };
  }

  async fetchPages(spaceKey: string, limit = 50): Promise<ConfluencePage[]> {
    const pages: ConfluencePage[] = [];
    let start = 0;
    let hasMore = true;
    while (hasMore) {
      const url = `${this.baseUrl}/wiki/rest/api/content?type=page&spaceKey=${encodeURIComponent(spaceKey)}&expand=body.storage&limit=${limit}&start=${start}`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        throw new ConfluenceApiError(res.status, await res.text());
      }
      const data = (await res.json()) as ConfluenceApiResponse;
      pages.push(...data.results);
      hasMore = !!data._links?.next && data.size === limit;
      start += limit;
    }
    return pages;
  }
}

export class ConfluenceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Confluence API error ${status}: ${body}`);
    this.name = "ConfluenceApiError";
  }
}
