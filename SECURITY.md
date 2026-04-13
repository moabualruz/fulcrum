# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.0.x   | ✓         |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

To report a vulnerability, open a [GitHub Security Advisory](https://github.com/moabualruz/fulcrum/security/advisories/new) on this repository. This keeps the report private until a fix is available.

Include as much of the following as possible:

- Type of issue (e.g. SQL injection, path traversal, data exposure)
- Affected file(s) and line numbers
- Steps to reproduce
- Proof-of-concept or exploit code (if possible)
- Impact assessment

You can expect an acknowledgement within 72 hours and a status update within 7 days.

## Scope

Fulcrum is a local-first library — it has no server component, no network listener, and no authentication layer by design. The attack surface is:

- The SQLite database file (`.fulcrum/fulcrum.db`) — protect it with filesystem permissions
- The `.fulcrum.json` config file — do not commit API keys or secrets to it
- The embedding model cache (`.fulcrum/models/`) — models are downloaded from Hugging Face

Out of scope: issues that require physical access to the machine or root privileges.
