# Gated read-only integration

The separately typed `self:test:integration:readonly` command checks a designated disposable Google account through the production OAuth implementation, Google SDK and existing library read handlers. It does not require mcporter registration. The command stays outside default CI; the ordinary Vitest suite proves its guards and SDK request construction with synthetic transports and temporary tokens, retaining 100% coverage. Those tests are offline evidence, not a real-provider verification result.

## Designate the account before running

The principal must explicitly designate a disposable Google account and dedicated credential source and authorise this read-only run. Complete consent separately through [authentication](../user/authentication.md) and [Google Cloud setup](../user/google-cloud-setup.md). Consent is not initiated by this command. The existing default scopes include permissions broader than this runner uses; obtain the principal's consent for the actual token scopes before running.

Set these values through your approved local environment or secret manager. Do not commit credentials or copy the ordinary account's tokens to create a test fixture:

- `INTEGRATION=1` must match exactly; an absent or other value fails before file or provider access.
- `MCP_GSUITE_INTEGRATION_EXPECTED_EMAIL` is the nonsecret, explicitly designated disposable account email. Gmail profile must match it before subsequent reads; email comparison ignores case and surrounding whitespace in the expected value.
- `MCP_GSUITE_INTEGRATION_TOKEN_PATH` is an explicit absolute path to a separately consented token file named `integration-oauth-tokens.json`. It must be a regular file at its canonical path, with one hard link, mode 0600 and at most 64 KiB. Symlinked files or ancestors, a relative path, the ordinary configured token path and missing credentials fail closed. The dedicated name avoids silently selecting the ordinary token-store default; it does not itself prove that an account is disposable. Token JSON must be an object with at least one nonempty string access or refresh token; malformed, null, numeric, object-valued and blank token fields are rejected before the probe factory or any provider access.
- `MCP_GSUITE_CLIENT_ID` and `MCP_GSUITE_CLIENT_SECRET` identify the OAuth client used for those dedicated tokens. Neither is printed.

After designation and run authorisation, invoke:

```bash
bun run self:test:integration:readonly
```

The script uses Bun's `--no-env-file` option so dotenv files cannot opt it in or select an ordinary account. It constructs trusted read-only configuration from the explicit values above; ordinary host access-level, audit settings and token defaults are not used. Run it in its own process because it resets the shared process-local auth cache on entry and exit.

## Requests and local effects

The request sequence stops at the first failure:

1. Gmail `users.getProfile`, requesting only `emailAddress`, checks the expected identity. A mismatch prevents every subsequent Workspace read.
2. The production Gmail label-list handler makes one label-list request. Gmail has no page-size option for this endpoint; the runner rejects more than 10,000 labels.
3. The production Calendar event-list handler reads one page of up to five events from `primary`.
4. The production Drive file-list handler reads one page of up to five root-folder metadata entries. It requests only `id`, `name`, `mimeType` and `modifiedTime`; file contents are not read.

No send, draft creation, archive, mailbox mutation, Calendar mutation, Drive write or Sheets write is performed. OAuth may refresh an expired access token through Google's token endpoint before a read. The existing auth implementation atomically persists refreshed credentials to the designated file at mode 0600 and preserves its refresh token. That bounded local credential-file update is the only intended filesystem write; no recording, user-state copy, audit file or payload artifact is produced.

## Result and evidence

Success returns a JSON success flag, identity-verification flag and counts for labels, Calendar events and Drive files. A count describes only the fetched page, not the whole account. Failure returns a JSON failure flag and a fixed category: `disabled`, `configuration`, `credentials`, `identity` or `provider`. Exit status is zero only on complete success. Tokens, account email, file paths, labels, event descriptions, file names and raw provider errors are never emitted; a provider failure may mean consent, scopes or Google availability need separate investigation.

Keep only the redacted result and an account/consent/run-authority reference as real-provider evidence. Successful synthetic tests establish guard behavior and SDK GET request construction, including page bounds and refresh persistence; they do not establish consent, scopes, network compatibility or provider responses for a real account. Real-provider verification remains pending until the designated account is supplied and this exact read-only run is authorised and verified.

## Legacy record and replay

`scripts/integration.ts` remains the legacy mcporter path. Its `@ts-nocheck` header reflects the missing generated-client registration, and it invokes only `gsuite_about`, so its metadata recording does not demonstrate Google reads. `ki:test:record` contacts the external mcporter server and copies a recording into repository fixtures; `ki:test:replay` copies fixtures into the user's mcporter state before replay. Neither command belongs to the default offline gates or this new isolated verification flow. Do not run them without their separate authority or treat a recorded metadata result as live Google verification.
