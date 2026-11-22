# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Added the protected list: `MCP_GSUITE_PROTECTED_FILE` names a per-account TOML file of labels, held by id with their subtrees, that every mail-changing tool refuses to touch with `PROTECTED_REFUSED`; `gsuite_email_protected_list` reports it, and an unusable file blocks those writes.
- Added `metadataOnly` to `gsuite_email_messages_search`, which returns headers and labels without the snippet.
- Consolidated Google email, calendar, and Drive access.
