# Contributing

Thanks for your interest. This file covers the dev loop, conventions, and what to check before you open a PR.

## Setup

You'll need [Bun](https://bun.sh) 1.3+ for the dev loop, and Node.js 22+ to run the compiled `dist/`.

```bash
git clone https://github.com/knowledgeislands/mcp-gsuite.git
cd mcp-gsuite
bun install
bun install --cwd tooling/depcruise
```

`bun install` triggers `prepare`, which points Git at the committed `.githooks/` hooks, so every commit runs `lint-staged` and the `syncpack` format check on what you stage, and `commitlint` over the message. The second install provides the isolated module-boundary checker that `bun run test` drives.

## Dev loop

```bash
bun run ki:server:mcp:dev      # bun --watch — runs the MCP server from source
bun run ki:server:auth:dev     # bun --watch — runs the OAuth callback server from source
bun run ki:server:mcp:inspect  # MCP Inspector against the TS source
bun run build                  # tsc build into dist/
bun run ki:test:smoke          # build, then boot the server and check its tool surface
ki repo audit --repo .         # the main gate: Biome, TypeScript, syncpack, knip, coverage, rumdl
ki repo conform --repo .       # the safe fixes the audit can apply
bun run test                   # vitest (use `bun run test`, not `bun test`)
bun run test:watch             # vitest in watch mode
bun run test:coverage          # vitest with v8 coverage report
```

## Conventions

### Code

- **TypeScript ES modules** — `"type": "module"`, internal imports use `.js` extensions (e.g. `from '../../main/labels/index.js'`) so `tsc` emits valid JS.
- **Arrow functions** for top-level declarations (`export const foo = () => …`).
- **Config injection** — `loadConfig(env?)` in `src/config/index.ts` returns a plain `Config`; nothing reads env at import time. Tool defs in `src/tools/` are thin and call into `src/main/<area>/`, where every entry point takes its config slice as the first argument. See the "Configuration and layers" section of `AGENTS.md`.
- **Token handling**: tokens live at `~/.local/state/ki/mcp-gsuite/oauth-tokens.json` with `0600` permissions. Never log token values; use `redactedTokenSummary(cfg.auth)` from `src/main/auth/index.ts` when surfacing auth state.
- **Errors**: tools return MCP errors via `errorResult(...)`; structured results via `jsonResult(...)`.
- **Annotations**: be honest with `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` on every tool registration.

### Commits

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) so version bumps are easy to derive when releasing by hand. There is no auto-release pipeline.

| Type        | What it means           | Bumps |
| ----------- | ----------------------- | ----- |
| `feat:`     | new feature             | minor |
| `fix:`      | bug fix                 | patch |
| `perf:`     | performance improvement | patch |
| `docs:`     | documentation only      | patch |
| `deps:`     | dependency change       | patch |
| `refactor:` | internal restructuring  | none  |
| `test:`     | test-only changes       | none  |
| `chore:`    | tooling, config         | none  |
| `build:`    | build pipeline          | none  |
| `ci:`       | CI changes              | none  |

Add `!` for breaking changes (`feat!:` / `fix!:`) — bumps major.

### Testing

- New code should ship with tests. Vitest is configured with V8 coverage and has thresholds in `vitest.config.ts` — if your change drops coverage below the threshold, CI fails.
- File-level isolation: tests should clean up after themselves with `beforeEach`/`afterEach`.

## Before opening a PR

- [ ] `ki repo audit --repo .` reports no failures (it runs Biome, TypeScript, syncpack, knip and coverage)
- [ ] `bun run ki:test:smoke` passes
- [ ] Commit messages follow Conventional Commits
- [ ] If you added/removed/renamed a tool, update `README.md` and `AGENTS.md`

CI runs all of the above on every PR.
