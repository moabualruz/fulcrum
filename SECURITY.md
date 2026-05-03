# Security Policy

## Responsible Disclosure

Report suspected vulnerabilities to security@fulcrum.local. Include affected versions, reproduction steps, impact, and any relevant logs or proof of concept.

Please avoid public disclosure until the reporting flow below completes or the embargo timeline expires.

## Reporting Flow

1. Reporter sends details to security@fulcrum.local.
2. Maintainer opens or links a private GitHub security advisory.
3. Maintainer validates impact and prepares a patch.
4. Fix is released and affected users receive upgrade guidance.
5. Public disclosure follows after release or embargo expiry.

## Embargo Timeline

Security fixes target release within 24 hours for critical issues. Coordinated disclosure embargo is capped at 90 days from maintainer acknowledgement unless the reporter and maintainer agree to earlier disclosure.

## Security Surface Scope

Security reports are in scope when they affect:

- Authentication, sessions, authorization, roles, or tenant isolation.
- Secret storage, keyring access, credential encryption, or plaintext leaks.
- Sandbox isolation for agent execution.
- Data-at-rest encryption for credentials, backups, or exported archives.
- HTTPS and secure-cookie behavior in production deployments.
- Backup, restore, import, or export paths that can expose private data.

Out-of-scope examples: spam, social engineering without a technical exploit, denial-of-service requiring unrealistic local machine access, and reports against unsupported versions.
