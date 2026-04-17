# @fulcrum/cockpit — npm Publishing Decision

## npm Org and Package Scope

- **npm org**: `@fulcrum` (or `@moabualruz/fulcrum-cockpit` if the `@fulcrum` org is unavailable)
- **Package name**: `@fulcrum/cockpit`
- **Access**: public (`publishConfig: { access: "public" }`)

## Publish-Key Custodian

- **Custodian**: workspace owner (mkh.ruzz@gmail.com)
- **Token type**: Automation token scoped to `@fulcrum/*` packages only, stored in GitHub Actions secret `NPM_TOKEN`
- **2FA**: Required for all publish operations (enforced by npm `require2fa` setting)

## Release Automation Flow

1. Bump version in `package.json` via PR (follows semver)
2. Merge to `main` triggers `.github/workflows/publish-cockpit.yml`
3. Workflow runs `pnpm publish --provenance` for supply-chain attestation (security F10)
4. npm provenance attestation links the published package to the GitHub Actions run

## Pre-publish Checklist

- [ ] `pnpm publish --dry-run` succeeds from this directory
- [ ] All peer dependency version ranges are up to date with PI agent release
- [ ] `README.md` reflects current feature set
- [ ] `index.ts` exports are stable (no breaking removals without major version bump)
- [ ] `NPM_TOKEN` secret is set in GitHub repository settings

## Notes

- The `pi` field in `package.json` is a PI-agent-specific manifest (not standard npm); it will be ignored by npm registry and consumed by the PI agent loader.
- Published package is consumed by PI users via `pi add @fulcrum/cockpit` (once PI supports npm package loading).
