# operate-alerts: mislabeled-route content migration

> Migrated by `prd-cross-mislabeled-route-content-migration` (Design Fidelity
> Recovery). The `operate-alerts` route name is freed for its OD surface; the
> current content is preserved here so the route-rebuild PRD re-homes it
> without feature loss.

## What this route currently rendered (mislabeled)

`<h1>Login sessions</h1>` (`data-operate-alerts-header`,
`data-operate-alerts-count`, `data-revoke-other-sessions`): NOT the OD Operate
Alerts console. It is a login-sessions / active-session management table: a
device/IP session list, a current-session marker, and a revoke-other-sessions
action.

## Preserved artifact

- `+page.svelte.preserved`: the full route content, verbatim.
- `operate-alerts.spec.ts.preserved`: the original login-sessions design-e2e
  spec, verbatim (device/browser/IP session list, current-session marker,
  revoke-with-confirmation, bulk revoke-other-sessions, audit entries).
  Preserved by `prd-web-operate-alerts-console-od-fidelity` when it rebuilt
  `apps/web/tests/design-e2e/operate-alerts.spec.ts` as the OD Alerts console
  spec. The account-security PRD lifts this spec into the Settings
  active-sessions panel coverage, renaming `data-operate-alerts-*` /
  `data-session-*` / `data-revoke-*` hooks to `data-account-sessions-*`: no
  session-management test coverage is lost.

## Disposition

- **Disposition:** re-home (no feature loss). HIGH RISK: login-session
  management is a real account-security feature.
- **Re-home destination:** the auth/account-security cluster: the Settings
  active-sessions panel (per `design-alignment/operate.md` §operate-alerts and
  `design-alignment/auth.md`: login-session management folds into Settings ·
  Account/Privacy as the active-sessions panel). The `data-operate-alerts-*`
  hooks are renamed to `data-account-sessions-*` as part of that re-home. The
  destination panel is owned by the still-unbuilt
  `prd-web-system-account-security`.
- **Owning rebuild PRD:** `prd-web-operate-alerts-console-od-fidelity`
  (`vertical-prds.jsonl`, status `proposed`): it `depends_on` this PRD, and its
  acceptance bullet "The mislabelled login-sessions table is re-homed to the
  Auth/account-security cluster with data-operate-alerts* renamed to
  data-account-sessions* and no feature loss" lifts this artifact.
- **Live route now:** `+page.server.ts` 308-redirects `/operate-alerts` →
  `/settings` (the live Settings surface hosting the account-security cluster)
  so the old path never returns 404 until the OD Alerts console ships and the
  account-security PRD builds the active-sessions panel.
