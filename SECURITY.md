# Security Policy

## Reporting a Vulnerability

If you find a security issue in `@knowledgeislands/mcp-gsuite`, **please do not file a public GitHub issue.** Instead, email the maintainer directly:

- **<kris@kris.me.uk>** — subject: `mcp-gsuite security`

Include:

- A description of the issue and the impact (e.g. "token exfil", "auth bypass").
- Steps to reproduce, ideally with a minimal proof-of-concept.
- The version of the package (`npm ls @knowledgeislands/mcp-gsuite`) and Node version.

You should expect an acknowledgement within 72 hours. We aim to triage, investigate, and ship a fix within 14 days for high-severity issues.

## Scope

In scope:

- Authentication and token handling (`src/main/auth/`, `src/auth-server/`, `src/main/auth-info/`, `src/tools/auth/`).
- Tools that call the Gmail API — thin defs in `src/tools/{labels,messages,threads,drafts,attachments}/` over the implementations in `src/main/{labels,messages,threads,drafts,attachments}/` and the Gmail payload parsing in `src/main/email/`.

Out of scope:

- Issues only reproducible against a forked or modified version.
- Vulnerabilities in upstream Google Gmail API endpoints (please report those to Google via <https://bughunters.google.com>).
- Issues that require local OS-level access already higher-privileged than the user running the MCP server.

## Token Storage

OAuth tokens are stored at `~/.mcp-gsuite-tokens.json` with `0600` permissions (owner read/write only). Tokens are refreshed transparently; if you suspect your tokens have leaked, **delete that file immediately** and re-authenticate.

You can also revoke the app's access from <https://myaccount.google.com/permissions>.

## Supported Versions

Pre-release `0.x` builds receive security fixes on a best-effort basis. The supported-version table will be updated once `1.0.0` ships.

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | :white_check_mark: |
