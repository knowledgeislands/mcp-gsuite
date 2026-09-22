# mcp-gsuite guides

`mcp-gsuite` is a Model Context Protocol server that gives an MCP client access to one Google account — Gmail, Calendar, Drive and Sheets — over a local stdio process. These guides explain how to get it running against your own account and how to change it.

Start with the audience you belong to.

## Running the server against your account

[User guides](user/README.md) are for anyone who wants this server connected to their MCP client. They cover the Google Cloud Console work that has to happen before anything else, installing and configuring the server, signing in, the everyday workflows it is good at, and what to do when Google refuses.

Nobody operates this server on anybody else's behalf: it is a local process started by your own client, reading your own credentials, against your own mailbox. There is no separate operator audience, so there is no `operator/` collection.

## Changing the server

[Developer guides](developer/README.md) are for anyone editing this repository. They cover running the two processes from source with the inspector attached, and adding a tool through the annotation-driven access gate that decides what the server registers.

## What lives elsewhere

A guide answers **how**. The neighbouring sources answer other questions, and these guides link to them rather than restate them:

- [`README.md`](../../README.md) says what the server is and enumerates its tool surface. The running server's `tools/list` response is the authority on which tools exist; the README table is a readable copy of it.
- [Decision Records](../decisions/README.md) answer **why**, for choices that outlive the code that implements them.
- [Roadmap items](../roadmap) answer **when**, covering behaviour that is planned rather than delivered.
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) holds contribution mechanics: cloning, the commit convention, and the checks to pass before opening a pull request.
- [`AGENTS.md`](../../AGENTS.md) and [`CLAUDE.md`](../../CLAUDE.md) hold the architecture and safety invariants a change must not break. Read them before changing `src/`.
