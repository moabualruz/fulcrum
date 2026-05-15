/**
 * In-memory marketplace registry.
 * Stores listings; supports browse (with query/tag filter), fetch, and publish.
 * Will be backed by persistent storage when product-kernel marketplace tables land.
 */

import type { MarketplaceListing } from "./types.ts";
import { ListingNotFoundError } from "./types.ts";

const listings = new Map<string, MarketplaceListing>();

/** Reset registry (for tests). */
export function resetRegistry(): void {
  listings.clear();
}

/** Seed registry with listings (for tests or bootstrap). */
export function seedRegistry(items: MarketplaceListing[]): void {
  for (const item of items) {
    listings.set(item.slug, item);
  }
}

/** Add or update a listing. */
export function upsertListing(listing: MarketplaceListing): void {
  listings.set(listing.slug, listing);
}

/** Browse listings with optional query and tag filters. */
export function browseListings(opts?: {
  query?: string;
  tags?: string[];
}): MarketplaceListing[] {
  let results = [...listings.values()];

  if (opts?.query) {
    const q = opts.query.toLowerCase();
    results = results.filter(
      (l) =>
        l.slug.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.publisher.toLowerCase().includes(q),
    );
  }

  if (opts?.tags && opts.tags.length > 0) {
    const tagSet = new Set(opts.tags.map((t) => t.toLowerCase()));
    results = results.filter((l) =>
      l.tags.some((t) => tagSet.has(t.toLowerCase())),
    );
  }

  return results.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Fetch a single listing by slug (optionally version). */
export function fetchListing(slug: string, _version?: string): MarketplaceListing {
  const listing = listings.get(slug);
  if (!listing) throw new ListingNotFoundError(slug);
  return listing;
}
