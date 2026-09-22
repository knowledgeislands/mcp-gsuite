# mcp-gsuite user guides

These guides are for anyone running `mcp-gsuite` against their own Google account. The server is a local process: your MCP client starts it, it reads credentials you supply, and it talks to Google's APIs as you. Nothing is hosted, and no data passes through a third party.

Setting up for the first time means four steps in order, because each one needs the output of the last: create Google OAuth credentials, install and build the server, point your MCP client at it, then sign in. Allow half an hour for the first pass, most of it in the Google Cloud Console.

## Create Google credentials

[Set up Google Cloud credentials](google-cloud-setup.md) covers the console work: creating a project, enabling the four APIs the server calls, taking the OAuth consent screen through its first-time wizard, publishing the app so refresh tokens survive longer than a week, declaring the scopes the server needs, and issuing the OAuth client ID and secret.

Do this first and do it completely. The step most people skip is declaring scopes on the Data Access tab, and its failure mode is the worst one here: sign-in appears to succeed and every API call afterwards returns 403.

## Install the server

[Install and connect the server](installation.md) covers the prerequisites, building `dist/` from source, and registering the built entry point with Claude Desktop, Claude Code, or any other MCP client. It ends with the checks that prove your client can see the server before you try to authenticate.

## Configure it

[Configure the server](configuration.md) covers every environment variable the server reads, and the one setting worth a deliberate decision: `MCP_GSUITE_ACCESS_LEVEL`, which decides at boot whether your client sees read-only tools, non-destructive writes, or the delete tools as well. It also covers the audit log, the download directory, and keeping two Google accounts side by side.

## Sign in

[Authenticate with Google](authentication.md) covers the out-of-band OAuth flow: starting the auth server, calling `gsuite_auth_start`, granting consent, and where the tokens land. It also covers forcing a fresh sign-in, switching accounts, and repairing a token whose scope set is short.

## Use it

[Everyday use](everyday-use.md) is the guide to come back to. It covers the workflows the tool surface is shaped for — triage by sender, contextual replies, bulk relabelling, attachment handling — and the caveats that catch people out, including the label name containing spaces that silently matches nothing.

## Recover from a failure

[Troubleshooting](troubleshooting.md) covers the failures a first-time reader actually hits: a port already bound, a 403 after a successful sign-in, a revoked refresh token, a client that shows no tools, and a refresh token that expires every seven days. Each entry names the cause and the command or console step that fixes it.
