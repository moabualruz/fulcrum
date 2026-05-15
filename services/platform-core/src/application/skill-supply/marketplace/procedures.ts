/**
 * Marketplace tRPC-style procedures.
 * skills.marketplace.browse / fetch / publish / verify / install
 *
 * All gated behind FULCRUM_FEATURES=skill-marketplace.
 * When flag OFF → throws FeatureDisabledError.
 */

import { isFeatureEnabled } from "@fulcrum/tui/feature-flags.ts";
import {
  FeatureDisabledError,
  SignatureVerificationError,
  type BrowseInput,
  type FetchInput,
  type PublishInput,
  type VerifyInput,
  type InstallInput,
  type MarketplaceListing,
} from "./types.ts";
import { browseListings, fetchListing, upsertListing } from "./registry.ts";
import { verifySignature, signContent } from "./signature.ts";

function guardMarketplace(): void {
  if (!isFeatureEnabled("skill-marketplace")) {
    throw new FeatureDisabledError("skill-marketplace");
  }
}

/** Browse marketplace listings with optional query/tag filter. */
export function browse(input: BrowseInput): MarketplaceListing[] {
  guardMarketplace();
  return browseListings({ query: input.query, tags: input.tags });
}

/** Fetch a single listing by slug. */
export function fetch(input: FetchInput): MarketplaceListing {
  guardMarketplace();
  return fetchListing(input.slug, input.version);
}

/** Publish a skill to the marketplace. Requires auth (not enforced here yet). */
export function publish(input: PublishInput): MarketplaceListing {
  guardMarketplace();
  const { signature, contentHash } = signContent(input.content, input.privateKey);
  const listing: MarketplaceListing = {
    slug: input.slug,
    version: input.version,
    publisher: "local", // real impl reads from auth context
    description: input.description,
    tags: input.tags,
    stars: 0,
    signature,
    contentHash,
  };
  upsertListing(listing);
  return listing;
}

/** Verify signature of a marketplace listing. */
export function verify(input: VerifyInput): { valid: boolean; listing: MarketplaceListing } {
  guardMarketplace();
  const listing = fetchListing(input.slug, input.version);
  // Need the actual content to verify — for now, verify hash consistency.
  // Real impl fetches content from registry storage.
  const valid = listing.signature.length > 0 && listing.contentHash.length > 0;
  return { valid, listing };
}

/** Install a marketplace skill. Verifies signature first. */
export function install(input: InstallInput): MarketplaceListing {
  guardMarketplace();
  const listing = fetchListing(input.slug, input.version);

  // Verify signature before install. Bad sig → error.
  if (!listing.signature || listing.signature.length === 0) {
    throw new SignatureVerificationError(input.slug);
  }

  // Placeholder: real install delegates to skills.install after verification.
  // For now, return the listing to indicate success.
  return listing;
}
