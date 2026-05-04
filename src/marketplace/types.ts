/**
 * Marketplace Zod schemas and TypeScript types.
 * Shared across tRPC procedures, CLI, TUI, and Web surfaces.
 */

// Inline minimal Zod-like validation (project has no zod dep yet).
// Shapes mirror what Zod schemas would produce; swap for real Zod when added.

export interface MarketplaceListing {
  slug: string;
  version: string;
  publisher: string;
  description: string;
  tags: string[];
  stars: number; // placeholder 0 until registry has star API
  signature: string; // base64-encoded Ed25519 sig over content hash
  contentHash: string; // hex SHA-256 of skill archive
}

export interface BrowseInput {
  query?: string;
  tags?: string[];
}

export interface FetchInput {
  slug: string;
  version?: string;
}

export interface PublishInput {
  slug: string;
  version: string;
  description: string;
  tags: string[];
  content: string; // skill content (SKILL.md body)
  privateKey: string; // Ed25519 private key for signing
}

export interface VerifyInput {
  slug: string;
  version?: string;
}

export interface InstallInput {
  slug: string;
  version?: string;
}

export class FeatureDisabledError extends Error {
  readonly code = "FEATURE_DISABLED" as const;
  constructor(flag: string) {
    super(`Feature "${flag}" is disabled. Set FULCRUM_FEATURES=${flag} to enable.`);
    this.name = "FeatureDisabledError";
  }
}

export class SignatureVerificationError extends Error {
  readonly code = "SIGNATURE_INVALID" as const;
  constructor(slug: string) {
    super(`Signature verification failed for "${slug}".`);
    this.name = "SignatureVerificationError";
  }
}

export class ListingNotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;
  constructor(slug: string) {
    super(`Listing "${slug}" not found in marketplace.`);
    this.name = "ListingNotFoundError";
  }
}
