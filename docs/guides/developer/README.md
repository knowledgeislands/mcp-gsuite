# Develop mcp-gsuite

These guides are for anyone changing this repository. They assume you can already run the server: if you cannot, work through the [user guides](../user/README.md) first, because most changes are only verifiable against a real Google account.

- [Local development](local-development.md) covers the two processes, running them from source, the inspector, the layout of `src/`, and the verification gates a change has to pass.
- [Add a tool](adding-a-tool.md) covers the procedure for extending the tool surface, including the two places the expected tool list has to be kept in step.

## What lives elsewhere

`CONTRIBUTING.md` holds contribution mechanics — cloning, the Conventional Commits convention, and the checklist to satisfy before opening a pull request. These guides do not repeat it.

`AGENTS.md` and `CLAUDE.md` hold the invariants a change must not break: injectable configuration with no module-level environment reads, thin tool modules over implementations in `src/main/`, and the OAuth and data-safety rules. Read them before touching `src/`. Where a guide and those files disagree, they win.
