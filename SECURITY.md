# Security Policy

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Open a [GitHub Security Advisory](https://github.com/moabualruz/fulcrum/security/advisories/new) or email **mkh.ruzz@gmail.com** with subject `[SECURITY] fulcrum`. Expect acknowledgement within 72 hours and a status update within 7 days.

Include: type of issue, affected file(s) and line numbers, steps to reproduce, proof-of-concept (if possible), and impact assessment.

---

## npm Publish Hygiene (Critical Constraint #21)

All `@fulcrum-agent-os/*` packages follow this publish posture:

1. **2FA enforced for human members.** The `@fulcrum-agent-os` npm org requires 2FA for all human members. CI uses an **automation token** (npm's approved CI token type, which bypasses interactive 2FA by design) stored as a GitHub Actions secret (`NPM_TOKEN`).

2. **Automation token, not a personal token.** The `NPM_TOKEN` secret is an org-scoped automation token — not a developer personal token, not a delete-capable token. It is revocable independently of any member account.

3. **CI-only publish path.** The only publish path is `.github/workflows/publish-*.yml`, triggered by a **signed release tag**. Direct `npm publish` from a developer machine is prohibited by org policy.

4. **Signed release tags.** Release tags are signed (`git tag -s`) with a GPG key registered with the npm org. CI verifies the tag signature before publish.

5. **Post-pack tarball scan.** Every publish workflow runs `npm pack` → extract → content scan before publishing. The scan checks extracted files for secrets and `.env` fragments (not just source files — catches build-time inlined secrets such as bundled env vars, sourcemaps, and minification artifacts).

Current publish workflows:

| Package | Workflow | Tag pattern |
|---|---|---|
| `@fulcrum-agent-os/opencode-plugin` | `.github/workflows/publish-opencode-plugin.yml` | `opencode-plugin/v*` |
| `@fulcrum-agent-os/pi-cockpit` | `.github/workflows/publish-pi-cockpit.yml` | `pi-cockpit/v*` |

---

## Marketplace-Backing Repo Posture (Critical Constraint #22)

The `moabualruz/fulcrum` repository backs the Fulcrum marketplace for Claude Code. Users who run `claude plugin marketplace add moabualruz/fulcrum` are trusting this repo.

Security posture:

1. **Branch protection on `main`.** Required reviews ≥ 1; no force-push; no admin bypass.

2. **Signed commits on `main`.** All commits to `main` must be GPG-signed.

3. **2FA membership.** Org/user membership limited to vetted identities with 2FA enabled.

4. **`source:` scoping.** The Fulcrum marketplace entry scopes delivery to `./agent-integration/claude` specifically. Users' plugin caches reflect only that subtree — the marketplace does not grant access to the full repo.

   Verify the scope:
   ```sh
   cat .claude-plugin/marketplace.json | grep source
   # → "source": "./agent-integration/claude"
   ```

---

## Scope

Fulcrum is local-first, but it does expose optional local server and transport surfaces. Treat it as a developer tool running on trusted machines, not as a hardened multi-tenant service. The main attack surface is:

- Profile-scoped SQLite, vault, graph, vector, and artifact roots under Fulcrum data directories
- Local MCP transports: stdio (`fulcrum serve mcp`) and Streamable HTTP (`fulcrum serve mcp-http`)
- Local HTTP monitor and control API (`fulcrum serve monitor` / `fulcrum serve all`)
- Runtime hook/integration files (`AGENTS.md`, Claude/Cursor/Windsurf/Codex/Copilot/opencode assets)
- Published npm packages (`fulcrum-agent-*`, `fulcrum-*`, `@fulcrum-agent-os/*`)

Security expectations for shipped RAG surfaces:

- Agent-facing traces, eval artifacts, events, and memory must redact secrets, raw environment values, and unintended absolute paths.
- Absolute paths are allowed only on explicit operator-facing preflight and report surfaces.
- Destructive or expensive RAG maintenance must stay profile-scoped and fail closed when profile boundaries are unsafe or ambiguous.

Out of scope: issues that require physical access to the machine or root privileges.

---

## Supported Versions

| Package | Status |
|---|---|
| `@fulcrum-agent-os/opencode-plugin` | ✅ Maintained |
| `@fulcrum-agent-os/pi-cockpit` | ✅ Maintained |
| `fulcrum-agent-cli` | ✅ Maintained |
| `fulcrum-mcp` | ✅ Maintained |
| `fulcrum-agent-core` | ✅ Maintained |
| `fulcrum-memory` | ✅ Maintained |

Only the latest minor version of each package receives security patches.
