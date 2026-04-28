## Patterns

### Pattern A — reformat a module in place

```bash
find src -name '*.java' -print0 | xargs -0 java -jar google-java-format.jar --replace
```

Use `find -print0 | xargs -0` for paths with spaces. The jar accepts an unbounded file list.

### Pattern B — CI check (fail on drift)

```bash
java -jar google-java-format.jar --dry-run $(find src -name '*.java')
# exits 0 if all files are already formatted; non-zero with filenames otherwise
```

Pair this with `--set-exit-if-changed` on older versions if `--dry-run` alone doesn't fail your CI; modern releases (≥1.17) exit non-zero by default when `--dry-run` finds drift.

### Pattern C — Android (AOSP) style

```bash
java -jar google-java-format.jar --aosp --replace android/app/src/main/java/**/*.java
```

`--aosp`/`-a` switches to 4-space indent / 8-space continuation. Don't mix with non-AOSP runs in the same module — the styles are not interoperable and will fight each other on every commit.

### Pattern D — read from stdin

```bash
cat Foo.java | java -jar google-java-format.jar -
git show HEAD:src/Foo.java | java -jar google-java-format.jar -
```

The single dash `-` means "read stdin, write stdout". Useful for editor integrations and for previewing what a file would look like without mutating it.

### Pattern E — skip the opinionated extras

```bash
java -jar google-java-format.jar --replace \
  --skip-sorting-imports \
  --skip-removing-unused-import \
  --skip-reflowing-long-strings \
  src/**/*.java
```

Each flag turns off one transformation. Use sparingly — most teams want all three on. Skip-sorting is sometimes useful when the project has a non-standard import grouping enforced elsewhere.

### Pattern F — JDK 16+ `--add-exports` requirement

```bash
java \
  --add-exports jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED \
  -jar google-java-format.jar --replace src/**/*.java
```

JDK 21+ is required (older 1.x lines supported JDK 11; recent releases ≥1.22 require JDK 21). On JDK 16+ the JVM seals `jdk.compiler` internals; recent jar releases ship a manifest that handles this transparently, but if you see `IllegalAccessError` or `module jdk.compiler does not export ...`, add the six `--add-exports` flags above.

### Pattern G — build integration

```bash
# Maven (Spotify's fmt-maven-plugin is the most common wrapper)
mvn com.spotify.fmt:fmt-maven-plugin:format          # mutate
mvn com.spotify.fmt:fmt-maven-plugin:check           # CI gate

# Gradle (via Spotless — the canonical orchestrator)
./gradlew spotlessApply                              # mutate
./gradlew spotlessCheck                              # CI gate

# Bazel — use rules_java + a genrule wrapping the jar
```

Spotless wraps multiple formatters (google-java-format, palantir-java-format, prettier-java) and is the recommended Gradle integration. The Maven plugins call the jar directly.
