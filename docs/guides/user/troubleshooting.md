# Troubleshoot mcp-gsuite

Use this guide when the server will not start, will not authenticate, or returns an error you did not expect. Entries are ordered roughly by when you hit them.

Failures that only occur while changing the code — a failing gate, a tool-surface mismatch — are in the [developer guides](../developer/README.md).

## The client lists no tools, or reports "Cannot find module"

The path in your client's configuration does not resolve to a built file. Rebuild and confirm:

```bash
bun run build
ls dist/mcp-server/index.js
```

Then restart the client. The `args` path must be absolute and must point at the compiled `dist/mcp-server/index.js`, never at the TypeScript source.

## The tool I want is missing

Check `MCP_GSUITE_ACCESS_LEVEL` before anything else. The default is `read`, which registers only the 18 read-only tools; every mutating tool — including `gsuite_auth_start` — is absent until you raise it to `write`, and the three delete tools until `destructive`. See [Configure the server](configuration.md).

A missing tool is the gate working, not a fault.

## The server exits at startup

An unrecognised `MCP_GSUITE_ACCESS_LEVEL` aborts the boot rather than falling back silently. The value must be exactly `read`, `write`, or `destructive`.

## Port 3334 is already in use

Another auth-server process is bound to the port. Free it:

```bash
bunx kill-port 3334
```

If you deliberately run the auth server on another port, set `MCP_GSUITE_AUTH_PORT`, set `MCP_GSUITE_REDIRECT_URI` to match, and add that redirect URI to the OAuth client in the Google Cloud Console. All three have to agree.

## Sign-in is blocked: "this app's request is invalid"

The redirect URI the server sent does not exactly match one registered on the OAuth client. Compare `MCP_GSUITE_REDIRECT_URI` against the client's **Authorized redirect URIs** list character by character — a differing port or a trailing slash is enough.

## Gmail returns 403 after a successful sign-in

The consent screen did not pre-declare the scope, so Google silently dropped it from the grant. Inspect the token file and look at the `scope` field:

```bash
cat ~/.local/state/ki/mcp-gsuite/oauth-tokens.json
```

If `gmail.modify` — or whichever scope the failing call needs — is absent, add it under **OAuth consent screen → Data Access**, then delete the token file and authenticate again:

```bash
rm ~/.local/state/ki/mcp-gsuite/oauth-tokens.json
```

This is the single most common failure with this server. Granting consent does not grant a scope that was never declared.

## A call fails naming a disabled API

Calendar, Drive and Sheets tools register regardless of which Google APIs the project has enabled, so a disabled API surfaces at call time rather than at startup. Enable it under **APIs & Services → Library**, as described in [Set up Google Cloud credentials](google-cloud-setup.md), and retry. No re-authentication is needed.

## The refresh token expires every seven days

The OAuth consent screen is in **Testing** mode, where Google expires refresh tokens after seven days. Switch it to **Published** under **OAuth consent screen → Audience**, then authenticate once more. The app stays unverified, which for personal use costs only a one-time **Advanced → continue** interstitial at sign-in.

## The token is revoked, or refresh fails

A revoked refresh token cannot be repaired. Delete the token file and sign in again:

```bash
rm ~/.local/state/ki/mcp-gsuite/oauth-tokens.json
```

Then start the auth server and call `gsuite_auth_start`. The same procedure switches the server to a different Google account.

## A search returns nothing when it should return something

Suspect the query before the mailbox. A label name containing spaces matches nothing when passed unquoted in a Gmail query — pass the label id in `labelIds`, or quote the name. [Everyday use](everyday-use.md) covers this and the other query behaviours worth knowing.

Also check whether you are looking at one page of results: a paginated response carries `nextPageToken`, and the remaining pages are only fetched if the client asks.

## An attachment download is refused

Two limits apply. An inline download is capped at 256 KiB of decoded bytes; above that the attachment must be written to disk with `outputPath`. And any `outputPath` is resolved beneath `MCP_GSUITE_DOWNLOAD_PATH` (default `~/Downloads`) and rejected if it escapes that root, lexically or through a symlink. Both are adjustable — see [Configure the server](configuration.md).

## Still stuck

Call `gsuite_about` and `gsuite_auth_status`. Between them they report the version, the resolved scope set, the token store path, and whether a token is persisted with what scopes — which is usually enough to tell a configuration problem from a consent problem. Neither ever returns a token value.

If the server's behaviour contradicts these guides, the behaviour is authoritative and the guide is wrong; raise it against this repository.
