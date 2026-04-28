## Invocation

```bash
# Report only — exits non-zero on findings, never mutates
ktlint                                          # lint all .kt/.kts under cwd (default glob)
ktlint 'src/**/*.kt'                            # explicit glob (quote it!)
ktlint 'src/**/*.kt' '!src/**/Generated.kt'     # negate with leading !

# Fix in place
ktlint -F                                       # short form
ktlint --format                                 # long form
ktlint -F 'src/**/*.kt'

# Android coding conventions — set in .editorconfig (the --android flag was removed in ktlint 1.0)
# [*.{kt,kts}]
# ktlint_code_style = android_studio
ktlint -F 'app/src/**/*.kt'                          # picks up android_studio style from .editorconfig

# Reporters (CI / pipelines)
ktlint --reporter=plain                         # default human
ktlint --reporter=json                          # for jq
ktlint --reporter=checkstyle                    # Jenkins / SonarQube
ktlint --reporter=html,output=report.html
ktlint --reporter=sarif,output=ktlint.sarif     # GitHub code-scanning

# Baseline (incremental adoption on legacy code)
ktlint --baseline=ktlint-baseline.xml           # ignore pre-existing
ktlint --baseline=ktlint-baseline.xml --format

# Pre-commit hook installer (writes .git/hooks/pre-commit)
ktlint installGitPreCommitHook

# Custom rule jar
ktlint --ruleset=path/to/custom-ruleset.jar
```

`ktlint` reads `.editorconfig` upward from each target file. Without `-F` ktlint **only reports** — agents that run `ktlint file.kt` and expect formatting are the #1 trip.
