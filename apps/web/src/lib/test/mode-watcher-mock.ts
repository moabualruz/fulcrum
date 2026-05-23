/**
 * Complete `mock.module` factory for the `mode-watcher` package.
 *
 * Bun's `mock.module` is process-global and freezes a module's export-name set
 * on first registration. Component tests only need `ModeWatcher` / `toggleMode`,
 * but `mode-watcher` exports a wider surface (`mode`, `theme`, `setMode`, …) and
 * `@fulcrum/ui-kit`'s `sonner` shell imports `mode`. A partial stub strips those
 * names from every later test that imports the real package. This factory keeps
 * the full surface so the export-name set is always complete.
 */
export function modeWatcherMock(): Record<string, unknown> {
  const noop = () => undefined;
  const store = { subscribe: (run: (value: unknown) => void) => { run(undefined); return () => undefined; } };
  return {
    ModeWatcher: () => "",
    toggleMode: noop,
    setMode: noop,
    resetMode: noop,
    setTheme: noop,
    generateSetInitialModeExpression: () => "",
    createInitialModeExpression: () => "",
    modeStorageKey: store,
    themeStorageKey: store,
    userPrefersMode: store,
    systemPrefersMode: store,
    mode: store,
    theme: store,
  };
}
