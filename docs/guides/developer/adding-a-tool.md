# Add a tool

Use this guide when extending the server's tool surface. It assumes the local setup in [Local development](local-development.md).

A tool is added in two halves: a thin definition under `src/tools/<resource>/` that validates the MCP envelope, and an implementation under `src/main/<resource>/` that does the work with its configuration slice passed in as the first argument. Keep them separate — that split is an invariant, not a style preference.

## Before you begin

Decide the tool's access level honestly, because the annotations you choose are what the gate reads. A tool that only reads is `READ_ONLY_REMOTE`. A tool that changes something recoverably is `WRITE_REMOTE`, or `WRITE_IDEMPOTENT_REMOTE` when repeating the call is harmless. A tool that destroys something is `DESTRUCTIVE_REMOTE`. If you cannot decide, the fail-safe derivation treats missing annotations as destructive, which tells you where the doubt should land.

There is no send tool, and adding one is not an ordinary change. The smoke test asserts that no tool name matches a send pattern; that assertion is the boundary, and removing it is a decision for the repository, not a step in this guide.

## Procedure

1. **Pick the resource module.** Add to an existing directory under [`src/tools/`](../../../src/tools/) or create a new one. Name the tool `gsuite_<domain>_<resource>_<action>` — `gsuite_email_messages_search`, `gsuite_calendar_event_create` — in snake case, with a plural resource for collection operations.

2. **Write the implementation** under `src/main/<resource>/`, taking its configuration slice as the first argument. No module-level environment reads, and no configuration singleton.

3. **Validate the input with a Zod schema.** Mark optional fields explicitly and prefer the shared primitives in [`src/utils/schemas.ts`](../../../src/utils/schemas.ts) over ad hoc string types, so identifier and length constraints stay consistent.

4. **Set the annotations** from the presets in [`src/utils/annotations.ts`](../../../src/utils/annotations.ts): `READ_ONLY_REMOTE`, `WRITE_REMOTE`, `WRITE_IDEMPOTENT_REMOTE`, or `DESTRUCTIVE_REMOTE`. The access-level gate in [`src/utils/access-level.ts`](../../../src/utils/access-level.ts) maps the annotation to `read`, `write`, or `destructive` and decides whether the tool registers under the configured `MCP_GSUITE_ACCESS_LEVEL`; the audit log records the same derived level. The annotations are also what clients see, so an inaccurate one misleads both the gate and the model.

5. **Return through the shared envelopes.** Success goes through `jsonResult(...)`; failure goes through `errorResult('verbing', err)`, which gives the client `isError: true` with a recognisable message.

6. **Re-export** the registration from [`src/tools/index.ts`](../../../src/tools/index.ts) if you created a new module.

7. **Update the expected tool list in both places.** `EXPECTED_TOOLS` in [`scripts/smoke.ts`](../../../scripts/smoke.ts) and the matching list in `src/tool-registration.test.ts` are independent copies, and both must agree with what the server registers.

8. **Update `README.md`** so the tool appears in its resource table with the right level, and add a footnote for any semantics a caller would otherwise have to read the source to discover.

## Verify

```bash
bun run ki:lint:types
bun run test:coverage
bun run ki:test:smoke
```

The smoke test boots the built server over stdio at `destructive` level and compares the live `tools/list` response against `EXPECTED_TOOLS`, so it is the check that proves the tool actually registers rather than merely compiling. Coverage is enforced at 100%, so the new implementation needs tests before the gate passes.

## Recovery

**"tool surface mismatch" naming your tool as `missing`.** The server did not register it. Either the registration is not reached from `src/tools/index.ts`, or the derived level is above the level the smoke test boots at — which for a `destructive` boot means it is not registering at all.

**"tool surface mismatch" naming your tool as `extra`.** The tool registers but one of the two expected lists was not updated. Update both.

**"forbidden send tool(s) exposed".** A tool name matched the send pattern. Rename it if that was accidental; if it was not, stop and raise it, because the drafts-only posture is deliberate.

**"tools missing inputSchema".** Every tool must register a schema. An empty input is `z.object({}).strict()`, not an omitted schema.
