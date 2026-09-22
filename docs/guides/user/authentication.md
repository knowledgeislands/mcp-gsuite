# Authenticate with Google

Use this guide to grant the server access to your Google account, and to repair that access when it lapses. It assumes you have completed [Set up Google Cloud credentials](google-cloud-setup.md) and [Install and connect the server](installation.md).

Sign-in happens out of band. The MCP server itself never handles a browser redirect: a separate, short-lived auth server does, on `http://localhost:3334`, and hands the resulting tokens to a file that the MCP server reads.

## Before you begin

- `MCP_GSUITE_ACCESS_LEVEL` must be `write` or higher in your client's configuration, because `gsuite_auth_start` persists a token file and is therefore a `write` tool. At the default `read` level it is not registered and you will not find it.
- The auth server is a process you start yourself, so it does not inherit your MCP client's `env` block. It reads the same `.env.local` / `.env` files from the repository root, or your shell environment. If your credentials live only in the client configuration, export them in the shell you start the auth server from.

## Sign in

1. Start the auth server from the repository root and leave it running:

   ```bash
   node dist/auth-server/index.js
   ```

   It prints `mcp-gsuite auth server listening on http://localhost:3334`. From a source checkout you can use `bun run ki:server:auth:dev` instead, which watches for changes.

2. In your MCP client, call the `gsuite_auth_start` tool. It returns the URL to open — `http://localhost:3334/auth`. The tool does not open a browser for you, and it does not perform the sign-in itself.

3. Open that URL. The auth server generates a PKCE challenge and a single-use state value, then redirects you to Google.

4. Sign in with the Google account you want the server to act as, and grant the requested scopes. For an unverified app you will pass a **Google hasn't verified this app** interstitial: choose **Advanced**, then continue.

5. Google redirects back to `http://localhost:3334/auth/callback`. The auth server exchanges the code for tokens, writes them to disk, and shows a success page. You can stop the auth server now; it is only needed to obtain or refresh consent.

6. Back in your client, call `gsuite_auth_status`. It reports whether a token is persisted, the granted scopes, and the expiry — never the token values themselves.

## Where the tokens live

Tokens, including the refresh token, are written to `~/.local/state/ki/mcp-gsuite/oauth-tokens.json` by default, with mode `0600`. Override the location with `MCP_GSUITE_TOKEN_PATH`; see [Configure the server](configuration.md) for running two accounts side by side.

The MCP server reads that file and refreshes the access token transparently when it expires, so ordinary use never needs the auth server again. Writes are atomic — a temporary file and a rename — so an interrupted refresh cannot leave a corrupt token file behind.

That file is the account. Treat it as a credential: anyone who can read it can act as you against the granted scopes.

## Verify

Ask your client to call `gsuite_auth_status`, then make one real read — listing labels is the cheapest:

- `gsuite_auth_status` reports a persisted token whose `scope` includes every scope you declared.
- `gsuite_email_labels_list` returns your labels rather than an error.

If the first succeeds and the second returns 403, the granted scope set is short. That is the failure covered next.

## Recovery

**Force a fresh sign-in.** Delete the token file and start again. This is also how you switch to a different Google account:

```bash
rm ~/.local/state/ki/mcp-gsuite/oauth-tokens.json
```

Then start the auth server and call `gsuite_auth_start` again.

**Calls return 403 after a successful sign-in.** Google grants only the scopes pre-declared on the consent screen. Inspect the `scope` field in the token file; if a scope you need is missing, add it under **OAuth consent screen → Data Access** as described in [Set up Google Cloud credentials](google-cloud-setup.md), delete the token file, and authenticate again. Changing `MCP_GSUITE_SCOPES` alone does not fix this — Google has to be told first.

**The refresh token expires every seven days.** The consent screen is still in **Testing** mode. Publish the app under **OAuth consent screen → Audience**, then re-authenticate once.

**Refresh fails, or you revoked access from your Google account page.** The refresh token is dead and cannot be repaired. Delete the token file and sign in again.

**The auth server shows a configuration error page.** It could not see `MCP_GSUITE_CLIENT_ID` or `MCP_GSUITE_CLIENT_SECRET`. Check the environment of the shell you started it from, not the client's configuration.

**The callback shows an invalid-state page.** The state value did not match a pending flow: it had already been used, or it expired. Start again from `http://localhost:3334/auth` rather than replaying the callback URL.

More failure modes are collected in [Troubleshooting](troubleshooting.md).
