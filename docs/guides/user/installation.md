# Install and connect the server

Use this guide once you have a Google OAuth client ID and secret from [Set up Google Cloud credentials](google-cloud-setup.md). It ends with your MCP client listing the server's tools; signing in comes afterwards, in [Authenticate with Google](authentication.md).

## Before you begin

- [Bun](https://bun.sh) 1.3 or later, for installing dependencies and building.
- Node.js 22 or later, which is what actually runs the built server.
- The client ID and secret from the Google Cloud Console.
- An MCP client that launches a local stdio command — Claude Desktop, Claude Code, or any other.

The server is not published to a package registry. Install it from a checkout.

## 1. Build the server

```bash
git clone https://github.com/knowledgeislands/mcp-gsuite.git
cd mcp-gsuite
bun install
bun run build
```

`bun install` also configures the repository's Git hooks, which matters only if you intend to commit to it.

`bun run build` compiles TypeScript to `dist/`. Two entry points come out of it, and both are used:

- `dist/mcp-server/index.js` — the MCP server your client launches.
- `dist/auth-server/index.js` — the standalone OAuth callback server, used during sign-in.

Confirm the build landed before configuring anything:

```bash
ls dist/mcp-server/index.js dist/auth-server/index.js
```

Rebuild after every `git pull`. A stale `dist/` is the cause of the "my client shows the old tool surface" report.

## 2. Register the server with your client

Your client needs an absolute path to `dist/mcp-server/index.js` and the two credential values. Point at the compiled JavaScript, never at the TypeScript source.

For Claude Desktop, add this to its configuration file:

```json
{
  "mcpServers": {
    "mcp-gsuite": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-gsuite/dist/mcp-server/index.js"],
      "env": {
        "MCP_GSUITE_CLIENT_ID": "your-client-id",
        "MCP_GSUITE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

[`claude-config-sample.json`](../../../claude-config-sample.json) in the repository root is the same block, ready to copy. Most other clients accept the same three fields — `command`, `args`, `env` — under their own configuration key; Claude Code reads a project-scoped `.mcp.json` of this shape, and `claude mcp add --help` describes its command-line equivalent.

Restart the client after editing its configuration. Nothing re-reads that file on the fly.

### Supplying credentials without the client's env block

If you would rather not put the secret in a client configuration file, copy `.env.example` to `.env.local` in the repository root and set the values there. The server hydrates its environment from the package root on load, reading `.env.local` first, then `.env.<NODE_ENV>` when `NODE_ENV` is set, then `.env`. A variable already present in the process environment always wins over a file, so the client's `env` block takes precedence when both exist.

`.env*` files are gitignored; only `.env*.example` templates are committed.

Every other setting is optional and documented in [Configure the server](configuration.md). Decide `MCP_GSUITE_ACCESS_LEVEL` deliberately before you go further: the default is `read`, which registers read-only tools and nothing else.

## Verify

After restarting the client, its tool list should include `gsuite_about` and `gsuite_auth_status`. Ask the client to call `gsuite_about`; it reports the server version, the scopes it will request, and the token store path, without needing any credentials to be valid.

At the default access level, `gsuite_auth_start` is deliberately absent — it is a `write` tool because it persists a token file. If you intend to sign in, set `MCP_GSUITE_ACCESS_LEVEL=write` (or higher) in the same `env` block and restart the client before continuing to [Authenticate with Google](authentication.md).

## Recovery

**The client lists no tools, or reports "Cannot find module".** The path in the configuration does not resolve to a built file. Rebuild, confirm the file exists, and check that the path is absolute:

```bash
bun run build
ls dist/mcp-server/index.js
```

Then restart the client.

**The server exits immediately at startup.** An unrecognised `MCP_GSUITE_ACCESS_LEVEL` value aborts the boot deliberately rather than silently falling back. It must be exactly `read`, `write`, or `destructive`.

**Tools appear but every call fails with a configuration error.** The client is not passing the credentials. Check for a typo in the variable names — they are `MCP_GSUITE_CLIENT_ID` and `MCP_GSUITE_CLIENT_SECRET` — and remember that a client's `env` block does not inherit your shell environment.

Further failures are collected in [Troubleshooting](troubleshooting.md).
