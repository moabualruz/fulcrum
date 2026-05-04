---
Status: completed
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/04-auth-routes.md, 01-foundation-reset/issues/14-saas-auth-gated-oauth-and-email-otp.md, 13-api-and-webhooks/issues/03-hono-openapi-gated.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q21, Q28, C1, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "API / webhooks / integrations")
Docs: https://www.better-auth.com/docs/authentication/oauth2, https://hono.dev/docs
---

# GATED: saas-auth (OAuth, signup, magic-link) + public-api (OpenAPI viewer, API settings page)

## What to build

Two gated features. `saas-auth`: OAuth buttons on `/auth/login` (Google, GitHub) rendered when flag ON; magic-link / email OTP via Better-Auth plugins; `/auth/signup` active (not 404) when flag ON; billing settings placeholder at `/settings/billing` (renders "billing not configured" unless billing provider also configured). `public-api`: `Settings → API` page shows base URL + copy-token button + API key management; OpenAPI spec viewer at `/api/v1/openapi.json` embedded in settings page via `<iframe>` or JSON renderer; Hono mount at `/api/v1` active when flag ON.

## Acceptance criteria

- [ ] `saas-auth` OFF: `/auth/login` shows no OAuth buttons; `/auth/signup` returns 404; `/settings/billing` hidden.
- [ ] `saas-auth` ON: Google + GitHub OAuth buttons render on login; click initiates redirect flow; signup form creates user + session; `/settings/billing` shows placeholder card.
- [ ] `public-api` OFF: `/api/v1` returns 404; Settings → API section hidden.
- [ ] `public-api` ON: `/api/v1/openapi.json` returns valid OpenAPI 3.1 JSON; Settings → API page shows base URL + "Copy API Key" button; at least 3 domains (tasks, docs, projects) have generated endpoints in spec.
- [ ] Outbound webhooks sub-flag `notify-webhook`: Settings → Integrations → Webhooks tab active; create subscription (URL + event pattern + signing secret) → `webhook_subscriptions` row created; delivery log table renders.
- [ ] Playwright: toggle `saas-auth` ON → login page shows OAuth buttons; toggle OFF → hidden.

## Blocked by

- Issue 04 (auth routes) — login/signup pages must exist.
- Pillar 1 issue 14 (saas-auth gated OAuth) — Better-Auth OAuth plugins.
- Pillar 13 issue 03 (Hono OpenAPI gated) — `/api/v1` mount.
