---
Status: ready-for-agent
Phase: P4
Priority: high
Test-file: tests/tui/settings.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Settings Screens (tabs, flags, i18n, auth, connectors)

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — settings screens`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — settings screens`

## What to test

- `src/tui/screens/settings.ts` — `SettingsTabs` + theme/secrets/backup tabs
- `src/tui/screens/settings-screens.ts` — `renderConnectorsScreen`, `renderCredentialsScreen`
- `src/tui/screens/flags.ts` — `FlagsScreen`
- `src/tui/screens/i18n-screen.ts` — `I18nScreen` (feature-flag gated)
- `src/tui/screens/auth.ts` — `AuthScreen`

## Setup

```ts
const mockFlags = [
  { name: "embeddings", enabled: false, description: "Hybrid vector search" },
  { name: "saas-auth", enabled: true, description: "External auth providers" },
];
const mockAuth = {
  userId: "u1", orgId: "org1", email: "test@example.com", role: "admin", passkeyCount: 2,
};
const mockConnectors = [
  { kind: "linear", enabled: true, runs: [{ kind: "linear", status: "ok", started_at: "2026-01-01", records_synced: 42, error: null }] },
];
```

## SettingsTabs steps

1. Instantiate `new SettingsTabs()`; `current` → "theme"
2. `Tab` key — cycles theme → secrets → errors → backup → telemetry → flags → data → theme
3. `Shift+Tab` — cycles backwards
4. `Esc` — `onExit` fires
5. Each tab renders distinct content (verify tab name in output)

## FlagsScreen steps

1. Load + render — both flags visible with name, enabled status, description
2. `j`/`k` — cursor moves
3. `Space` / `Enter` — `flags.set` called with flag name and toggled value
4. After toggle, `flags.list` called again (re-query)
5. `q` — exit fires
6. Render with empty flags list — no crash

## i18n-screen steps

1. `buildI18nScreen({ settings, env: {} })` — `visible: false`, `banner` present (flag OFF)
2. `buildI18nScreen({ settings, env: { FULCRUM_FEATURES: "i18n" } })` — `visible: true`, locales populated
3. Select locale via Enter — `settings.set(SETTINGS_KEY_LOCALE, locale)` called
4. Feature flag OFF: no locale list rendered

## AuthScreen steps

1. Render with `mockAuth` — email, orgId, role, passkey count all visible
2. `saas-auth` flag ON → auth providers section visible
3. `saas-auth` flag OFF → auth providers section hidden
4. `q` key → onExit fires

## renderConnectorsScreen (pure function) steps

1. Call with mockConnectors — output contains kind, ON/OFF, last-sync, records count
2. Run log section present for each connector
3. Hint line `[s] Sync [Enter] Config [q] Back` present

## Assertions

- [ ] SettingsTabs Tab/Shift+Tab cycle through all 7 tabs
- [ ] FlagsScreen toggle calls flags.set + re-queries list
- [ ] i18n screen hidden when flag OFF; locales visible when flag ON
- [ ] AuthScreen shows/hides providers based on saas-auth flag
- [ ] renderConnectorsScreen: output contains all required fields
