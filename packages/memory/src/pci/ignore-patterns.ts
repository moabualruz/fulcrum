// License: Apache-2.0
//
// v2a PR 1 Task 7 — shared ignore patterns for filesystem walks. Keeps JSON
// files (package.json, tsconfig.json, etc.) but skips lockfiles and obvious
// binaries. Mirrors prior-art reference verbatim including the security-sensitive section
// — this is a defense-in-depth list, not the authoritative secret-scan source.
export const DEFAULT_IGNORE_PATTERNS = [
  '*.lock',
  '*.bin',
  '*.ipynb',
  '*.pyc',
  '*.onnx',
  // Non-code text files
  '*.txt',
  '*.log',
  '*.csv',
  // Safety nets for nested non-git folders
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/target/**',
  '**/__pycache__/**',
  '**/coverage/**',
  '**/venv/**',
  // Test fixtures and benchmark data
  '**/fixtures/**',
  '**/benchmark/**',
  '**/testdata/**',
  '**/__fixtures__/**',
  '**/__snapshots__/**',
  // Lockfiles across ecosystems
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'composer.lock',
  'Cargo.lock',
  'Gemfile.lock',
  // Security: Sensitive files that should never be indexed
  '.env',
  '.env.*',
  '*.key',
  '*.pem',
  '*.p12',
  '*.pfx',
  '*.p8',
  '**/.ssh/**',
  'id_rsa',
  'id_ed25519',
  '*.pub',
  '**/.gnupg/**',
  '*.gpg',
  '**/.aws/**',
  '**/.gcloud/**',
  '**/.azure/**',
  'secrets.*',
  'credentials.*',
  // IDE and OS files
  '.DS_Store',
  '**/.idea/**',
  '**/.vscode/**',
  'Thumbs.db',
]
