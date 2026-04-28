## Invocation

```bash
# Build first — spotbugs reads bytecode, not source
mvn package -DskipTests          # or: ./gradlew assemble

# Text UI scan, XML report (canonical CI shape)
spotbugs -textui -xml:withMessages=bugs.xml target/myapp.jar

# Scan a class directory (no jar yet)
spotbugs -textui -xml:withMessages=bugs.xml target/classes

# Interactive review (developer triage)
spotbugs -gui

# Effort levels — more effort = more bugs, slower run
spotbugs -textui -effort:less   target/myapp.jar     # PR gate
spotbugs -textui -effort:max    target/myapp.jar     # nightly

# Confidence filter — keep only at-least-this-confident findings
spotbugs -textui -high   target/myapp.jar            # only HIGH-confidence
spotbugs -textui -medium target/myapp.jar            # HIGH + MEDIUM (default)
spotbugs -textui -low    target/myapp.jar            # everything

# Output formats
spotbugs -textui -xml:withMessages=bugs.xml   target/app.jar
spotbugs -textui -html=bugs.html              target/app.jar
spotbugs -textui -emacs                       target/app.jar
spotbugs -textui -sarif=bugs.sarif            target/app.jar

# Plugins — security and extra rules
spotbugs -textui -pluginList find-sec-bugs.jar,fb-contrib.jar -xml=bugs.xml app.jar

# Filter scope (XML filter file, not ruleset list)
spotbugs -textui -include  include-filter.xml -xml=bugs.xml app.jar
spotbugs -textui -exclude  exclude-filter.xml -xml=bugs.xml app.jar
```

`-textui` runs headless. Without it, spotbugs launches the Swing GUI, which fails in CI containers without a display.
