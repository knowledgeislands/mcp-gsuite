# Local development

Use this guide to run the server from source and to verify a change before handing it off.

## Before you begin

- [Bun](https://bun.sh) 1.3 or later for the dev loop; Node.js 22 or later runs the built output.
- `bun install` once, which also installs the Git hooks.
- A `.env.development` with your Google OAuth credentials, if you intend to exercise anything beyond `gsuite_about`:

  ```bash
  cp .env.example .env.development
  ```

  The `ki:server:*:dev` and `ki:server:mcp:inspect` scripts set `NODE_ENV=development`, so `.env.development` is the file they pick up.

Use `bun run test`, never `bun test`. The latter runs Bun's own runner against a suite written for Vitest and will mislead you.

## Two processes

The repository ships two entry points and they do different jobs:

- `src/mcp-server/index.ts` — the MCP server your client speaks to over stdio. It loads configuration once and registers every tool through the access-level gate.
- `src/auth-server/index.ts` — a standalone HTTP server on port 3334 that owns the OAuth consent flow and writes the token file. It is needed only while authenticating.

Run them from source with watch mode:

```bash
bun run ki:server:mcp:dev      # MCP server
bun run ki:server:auth:dev     # OAuth server on :3334
```

Or run the built output under Node, exactly as a client would:

```bash
bun run ki:server:mcp:start    # build, then run dist/ under node
bun run ki:server:auth:start   # build, then run the auth server under node
```

To drive the tool surface by hand without an MCP client, attach the MCP Inspector to the TypeScript source:

```bash
bun run ki:server:mcp:inspect
```

Remember that the access-level gate applies here too: at the default `read` level the inspector will not show you a mutating tool. Set `MCP_GSUITE_ACCESS_LEVEL=destructive` in `.env.development` when you need the whole surface.

## Where things live

```text
src/
├── config/index.ts         # loadConfig(env?) → Config; nothing reads env at import time
├── auth-server/index.ts    # standalone OAuth server (port 3334)
├── mcp-server/index.ts     # MCP entry point: loadConfig() then register every tool
├── tools/                  # thin tool definitions grouped by resource; call into main/
│   ├── auth/               # about, auth start, auth status
│   ├── labels/             # label list/create/update/delete
│   ├── messages/           # search, get, raw, label sugar, batch modify
│   ├── attachments/        # attachment get + metadata
│   ├── threads/            # thread search, get, label sugar
│   ├── drafts/             # draft create/update/list/get/delete
│   ├── calendar/           # calendars list, event list/get/create/update/delete
│   └── drive/              # Drive file listing and the Sheets tools
├── main/                   # the real implementations; config injected as the first argument
│   ├── auth/               # OAuth2 client, token refresh, atomic token persistence
│   ├── google-client/      # shared authorised client and service factories
│   ├── email/              # Gmail payload parsing: headers, body, attachments
│   ├── auth-info/          # about / authenticate / auth-status handlers
│   └── …                   # one function per tool, grouped by resource
└── utils/                  # MIME builder, paths, result envelopes, access level, audit log, annotations
```

The division matters: a module under `src/tools/` validates and adapts an MCP envelope and nothing else, while the work happens in `src/main/`, where every entry point takes its configuration slice as its first argument. Nothing reads `process.env` at import time. `CLAUDE.md` states these invariants in full.

The build emits to `dist/`, which is gitignored; `dist/mcp-server/index.js` is the file a client launches.

## Verify a change

Run these before handing work off, in roughly this order:

```bash
bun run ki:lint:types          # tsc --noEmit
bun run ki:lint:check          # Biome
bun run test                   # vitest
bun run test:coverage          # vitest with the 100% threshold enforced
bun run build                  # tsc → dist/
bun run ki:test:smoke          # build, boot over stdio MCP, assert the wire-level tool surface
```

Coverage is enforced at 100%, so a new branch without a test fails the gate rather than lowering the number. `bun run ki:lint:fix` applies Biome's safe and unsafe fixes when the check complains.

For authored Markdown, the repository's own gates are the audits:

```bash
ki repo audit --skill ki-authoring --repo .
ki repo audit --skill ki-guides --repo .
ki repo audit --repo .
```

CI runs lint, typecheck, coverage and smoke on every push.

## Integration tests against real Google APIs

`bun run ki:test:record` and `bun run ki:test:replay` drive the server against recorded traffic through `mcporter`. Recording contacts a real Google account and therefore needs explicit authority before you run it; replay uses the committed fixture and does not touch the network. Treat the recording step as something you ask about rather than something you do by default.

## Recovery

**`bun run ki:test:smoke` fails with "tool surface mismatch".** The expected tool list is out of step with what the server registers. [Add a tool](adding-a-tool.md) names the two places to update.

**`bun test` reports failures that `bun run test` does not.** You ran the wrong runner. Use `bun run test`.

**Coverage fails on a file you did not touch.** Check whether your change removed the only caller of an existing branch. The threshold is absolute, not a delta.

**The inspector shows fewer tools than you expect.** The access-level gate is filtering them. Raise `MCP_GSUITE_ACCESS_LEVEL` in `.env.development`.
