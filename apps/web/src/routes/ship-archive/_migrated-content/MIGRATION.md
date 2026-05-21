# ship-archive: mislabeled-route content migration

> Migrated by `prd-cross-mislabeled-route-content-migration` (Design Fidelity
> Recovery). The `ship-archive` route name is freed for its OD surface; the
> current content is preserved here so the route-rebuild PRD re-homes it
> without feature loss.

## What this route currently rendered (mislabeled)

`<h1>Permanently delete account</h1>`: NOT the OD Ship release archive. It is
the account-deletion + data-export surface: a data-export card
(`data-data-export`, `data-request-export`), a password-verified delete flow
(`data-account-delete-*` slots, `CredentialInput`,
`idle → confirming → verified → scheduled` stage machine), and an audit-entry
display.

## Preserved artifact

- `+page.svelte.preserved`: the full route content, verbatim.

## Disposition

- **Disposition:** re-home (no feature loss). HIGH RISK: account deletion is an
  irreversible-action surface.
- **Re-home destination:** Settings · Danger at `/settings/account/delete`
  (per `design-alignment/ship.md` §ship-archive Migration notes and
  `design-alignment/auth.md`: account deletion folds into the Settings
  `#danger` panel). That destination route is owned by the still-unbuilt
  `prd-web-system-account-security`.
- **Owning rebuild PRD:** `prd-web-ship-release-archive-od-fidelity`
  (`vertical-prds.jsonl`, status `proposed`): it `depends_on` this PRD, and its
  acceptance bullet "The mislabelled account-deletion page is re-homed to
  Settings · Danger (/settings/account/delete) with a 301 redirect and no
  feature loss" lifts this artifact. The account-security cluster doc
  `design-alignment/auth.md` names `prd-web-system-account-security` as the
  surface that absorbs the preserved delete + data-export flow.
- **Live route now:** `+page.server.ts` 308-redirects `/ship-archive` →
  `/settings` (the live Settings surface hosting the account-security/Danger
  cluster) so the old path never returns 404 until the OD release archive ships
  and the account-security PRD builds `/settings/account/delete`.
