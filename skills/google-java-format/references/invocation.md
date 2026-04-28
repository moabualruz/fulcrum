## Invocation

```bash
# Reformat in place (the canonical mutation invocation)
java -jar google-java-format.jar --replace src/**/*.java

# CI check — exit non-zero if anything would change; prints filenames
java -jar google-java-format.jar --dry-run src/**/*.java

# Android (AOSP) style — wider 4-space indent, 8-space continuation
java -jar google-java-format.jar --aosp --replace src/**/*.java

# Read from stdin, write to stdout (single dash means stdin)
cat Foo.java | java -jar google-java-format.jar -

# Skip the import sorter / unused-import remover / long-string reflow
java -jar google-java-format.jar --replace --skip-sorting-imports --skip-removing-unused-import Foo.java

# Homebrew bottle exposes a wrapper binary
google-java-format --replace src/**/*.java
```

`--replace`/`-r` mutates files. Without it, output goes to stdout — agents commonly run the tool, see "no diff", and assume it's a no-op when in fact it printed the formatted source and discarded it. Always pair with `--replace` when you want files changed.
