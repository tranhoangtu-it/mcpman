# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |
| < 1.0.0 | No        |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report privately via one of:
- GitHub: open a [private security advisory](https://github.com/tranhoangtu-it/mcpman/security/advisories/new)
- Email: see the contact in the GitHub profile

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

You can expect an acknowledgement within 72 hours and a fix timeline within 14 days for confirmed issues.

## Vault Encryption

The `mcpman secrets` vault uses:
- **Cipher:** AES-256-CBC
- **Key derivation:** PBKDF2-SHA256, 100 000 iterations
- **Storage:** `~/.mcpman/vault.enc` (local only, never synced to registries)
- Master password is never stored; it is required at runtime to decrypt secrets
