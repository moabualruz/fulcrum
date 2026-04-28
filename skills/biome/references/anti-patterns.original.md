## Anti-patterns

- **Don't run `biome format file.ts` and assume the file changed.** Without `--write` it only prints to stdout. Use `biome format --write` or, better, `biome check --write` for lint+format together.
- **Don't keep prettier and eslint installed alongside biome.** The whole point is one tool, one config; double-formatting fights itself. Run `biome migrate prettier` and `biome migrate eslint`, then uninstall both and delete their configs.
- **Don't assume Vue / Svelte / Astro support is on by default for old biome.** Support landed in biome v2.3.0 and is still experimental — verify your installed version (`biome --version`) before relying on it in CI. Pin a 2.3.0+ version in `package.json` if you depend on it.
- **Don't run `biome lint` and skip formatting.** That ships unformatted code. Use `biome check --write` so a single command covers both.
- **Don't use `--apply` in scripts pinned to "latest" biome.** The flag was renamed `--write`; older docs and snippets still show `--apply`. Either pin the biome version or use `--write` (accepted by every recent release).
- **Don't reach for biome to catch type errors.** `noUnusedVariables`, `noExplicitAny`, etc. are syntactic. For "is this assignable to that?" you still need `tsc --noEmit`.
- **Don't `grep` `biome check` output.** Use `--reporter=json` and pipe to `jq` — diagnostic shape is stable across versions; the human renderer is not.
- **Don't run `biome check --write` in CI.** Use `biome ci` — same checks, refuses to mutate, single non-zero exit code on any diagnostic.
