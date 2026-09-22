# Configure the server

Use this guide to decide what the server exposes and where it keeps its state. Two variables are required and everything else has a working default, so read the access-level section, then come back for the rest when you need it.

Set these wherever your client supplies environment to the server — its `env` block, or a `.env.local` file in the repository root. See [Install and connect the server](installation.md) for the precedence between the two.

## Choose an access level

`MCP_GSUITE_ACCESS_LEVEL` is the one setting worth a deliberate decision. It decides, at boot, which tools the server registers at all. A tool the server does not register cannot be called by mistake, cannot be suggested by a model, and does not appear in `tools/list`.

- **`read`** (default) — the 18 read-only tools. Search, read, list; nothing changes in your account.
- **`write`** — adds 21 non-destructive mutations: drafts, labels, relabelling, trash, calendar events, sheet updates, and `gsuite_auth_start`.
- **`destructive`** — adds the remaining 3: deleting a label, deleting a draft, and deleting a calendar event.

Levels nest, so `destructive` includes everything. Each tool's level comes from its MCP annotations rather than its name: `readOnlyHint: true` derives `read`; `destructiveHint: true` derives `destructive`; an explicit `readOnlyHint: false` with `destructiveHint: false` derives `write`; and missing annotations derive `destructive` as a fail-safe. A tool registers when its derived level is at or below the configured one. An unrecognised value aborts startup rather than falling back to a default.

Note the consequence for first-time setup: `gsuite_auth_start` persists a token file, so it is a `write` tool. At the default level you cannot sign in. Raise the level to `write`, authenticate, and lower it again afterwards if you want a read-only working posture — the token stays valid.

Two habits worth having. Trash is recoverable and deletion is not, which is why `gsuite_email_message_trash` is a `write` tool while `gsuite_email_draft_delete` is `destructive`. And there is no send tool at any level: the server composes drafts and you press Send in Gmail.

## Every environment variable

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `MCP_GSUITE_CLIENT_ID` | yes | — | OAuth 2.0 Client ID (`xxxx.apps.googleusercontent.com`). |
| `MCP_GSUITE_CLIENT_SECRET` | yes | — | OAuth 2.0 Client Secret. |
| `MCP_GSUITE_REDIRECT_URI` | no | `http://localhost:3334/auth/callback` | Must match the URI registered in Google Cloud. |
| `MCP_GSUITE_SCOPES` | no | `GSUITE_DEFAULT_SCOPES` (gmail.modify + calendar + drive.readonly + spreadsheets) | Space-separated OAuth scopes. † |
| `MCP_GSUITE_AUTH_PORT` | no | `3334` | Port the auth server listens on. Must match the redirect URI port. |
| `MCP_GSUITE_TOKEN_PATH` | no | `~/.local/state/ki/mcp-gsuite/oauth-tokens.json` | Token file location. Override to keep multiple accounts side by side. |
| `XDG_STATE_HOME` | no | `$HOME/.local/state` | Absolute base directory for the default OAuth and audit state paths. |
| `MCP_GSUITE_ACCESS_LEVEL` | no | `read` | Maximum tool access level to register. ‡ |
| `MCP_GSUITE_DOWNLOAD_PATH` | no | `~/Downloads` | Directory where attachment downloads are written. § |
| `MCP_GSUITE_INLINE_ATTACHMENT_MAX_BYTES` | no | `262144` (256 KiB) | Cap on inline-returned attachment bytes. ¶ |
| `MCP_GSUITE_AUDIT_LOG` | no | `writes` | Audit-log scope. ‖ |
| `MCP_GSUITE_AUDIT_LOG_PATH` | no | `~/.local/state/ki/mcp-gsuite/audit.jsonl` | Path to the JSONL audit log. |
| `MCP_GSUITE_AUDIT_LOG_MAX_BYTES` | no | `10485760` (10 MiB) | Size-based rotation threshold in bytes. Set to `0` to disable rotation. |
| `MCP_GSUITE_AUDIT_LOG_KEEP` | no | `5` | Number of rotated audit-log files to retain. |
| `NODE_ENV` | no | — | Affects which `.env*` files hydrate configuration. †† |

† Narrowing the set is supported, but Google only grants a scope that is also declared on the consent screen's Data Access tab. Declare there first, then narrow here, then re-authenticate.

‡ One of `read`, `write`, or `destructive`, as described above. Unknown values abort startup.

§ Any caller-supplied `outputPath` is resolved beneath this root and rejected if it escapes, lexically or through a symlink.

¶ Above this size an attachment must be written to disk with `outputPath` rather than returned inline.

‖ One of `off`, `writes` (record non-read tool calls only), or `all` (record every invocation).

†† On load the server reads, from the package root and highest precedence first, `.env.local`, then `.env.${NODE_ENV}` when `NODE_ENV` is set, then `.env`. A variable already in the environment always wins over a file. The `ki:server:*:dev` and `ki:server:mcp:inspect` scripts set `development`, so `.env.development` is picked up there.

## Keep two accounts side by side

The token file is the account. To run a personal and a work account at once, register the server twice in your client under different names, each with its own `MCP_GSUITE_TOKEN_PATH`:

```json
{
  "mcpServers": {
    "gsuite-personal": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-gsuite/dist/mcp-server/index.js"],
      "env": {
        "MCP_GSUITE_CLIENT_ID": "your-client-id",
        "MCP_GSUITE_CLIENT_SECRET": "your-client-secret",
        "MCP_GSUITE_TOKEN_PATH": "/Users/you/.local/state/ki/mcp-gsuite/personal.json"
      }
    }
  }
}
```

Authenticate each one separately. The two entries can share a Google OAuth client; they must not share a token path.

## Audit logging

With the default `writes` setting, every tool call whose derived level is not `read` is appended to `~/.local/state/ki/mcp-gsuite/audit.jsonl` as one JSON object per line, carrying the tool name and its derived level. Set `all` to record reads as well, or `off` to disable logging entirely — with `off` the wrapper short-circuits and never opens the file.

The log rotates at `MCP_GSUITE_AUDIT_LOG_MAX_BYTES` and keeps `MCP_GSUITE_AUDIT_LOG_KEEP` rotated files. It is local evidence of what the server was asked to do; nothing ships it anywhere.

## Verify

Call `gsuite_about` from your client. It reports the server version, the scope set the configuration resolved to, and the token store path in use — which is the quickest way to confirm that the client is passing the environment you think it is.

If a setting you changed is not reflected there, the client has not restarted or is reading a different configuration file.
