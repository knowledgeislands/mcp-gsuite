# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.10.0] - 2026-11-24

The server stays draft-only for mail, and its calendar writes now notify no one.

### Changed

- Every Calendar write passes `sendUpdates: "none"`.
- `gsuite_calendar_event_create` refuses attendees, so it never sends an invitation.
- `gsuite_calendar_event_update` and `gsuite_calendar_event_delete` refuse a meeting, meaning any event with attendees or one this calendar did not organise, in a delete preview as well as a live call, so neither sends an update or a cancellation.

### Removed

- The `attendees` argument of `gsuite_calendar_event_create` and `gsuite_calendar_event_update`.

### Added

- The protected list: `MCP_GSUITE_PROTECTED_FILE` names a per-account TOML file of labels, held by id with their subtrees, that every mail-changing tool refuses to touch with `PROTECTED_REFUSED`; `gsuite_email_protected_list` reports it, and an unusable file blocks those writes.
- `gsuite_email_messages_search` takes `metadataOnly`, which returns headers and labels without the snippet.
- Consolidated Google email, calendar, and Drive access.
