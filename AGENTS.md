# AGENTS.md

## Runtime

Use Bun (>= 1.3) for installation, development, and tests; use `bun run test`, never `bun test`. The published `dist/` servers run under Node (>= 22). Keep `NODE_ENV=development` confined to development and inspector commands; production configuration comes from the host environment.

## MCP architecture

Keep configuration injectable: no module-level environment reads or configuration singleton. The MCP and OAuth servers each load configuration once and pass the smallest required slice into registration or implementation functions. Tool modules validate and adapt MCP envelopes only; implementation belongs in `src/main/`. Register every tool through the annotation-driven access gate with an explicit annotation preset.

## OAuth and data safety

Never log or return access or refresh tokens. Preserve atomic `0600` token storage, exact single-use OAuth state validation, strict redirect and provider URL validation, bounded attachment handling, path containment, and header-injection guards. Mutating tools expose safe defaults and tests must use isolated fixtures rather than real Google accounts, mailboxes, calendars, drives, or token stores.

## Verification

Run `bunx tsc --noEmit`, `bun run test`, `bun run test:coverage`, `bun run build`, and the relevant focused `ki repo audit` commands. Record/replay integration commands contact external systems and require explicit authority.
