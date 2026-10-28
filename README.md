# durable

Multiplayer programming with [pi](https://github.com/earendil-works/pi). Several people share one agent session, and the agent works on one shared codebase.

> Early development. Not usable yet.

## How it works

```
pi client  --WebSocket-->  Cell (celld Durable Object + pi-durable)  --HTTP-->  Server (files, commands)
```

- **client**: a pi extension that joins a shared session.
- **cell**: one Durable Object per session. It runs the agent loop and stores the conversation.
- **server**: holds the codebase and runs the agent's file and shell tools.

## Development

Requires Node 22.19+, pnpm, and celld.

```
pnpm install --ignore-scripts
pnpm check
pnpm dev:cell
pnpm dev:server
```

## Server

Performs file and command operations inside one workspace directory for the Cell. Wire format: `docs/PROTOCOL.md`.

| Variable    | Meaning                                                      |
| ----------- | ------------------------------------------------------------ |
| `WORKSPACE` | Root directory (required). Paths are confined to it.         |
| `TOKEN`     | Bearer token (required). Every route but `/health` needs it. |
| `PORT`      | Listen port, default `8788`.                                 |

```
WORKSPACE=/path/to/checkout TOKEN=secret pnpm dev:server
curl localhost:8788/health
curl -H 'authorization: Bearer secret' -d '{"command":"ls"}' localhost:8788/exec
```

**Threat note:** `/exec` runs arbitrary commands as the user who started the Server. Path confinement covers the file routes and the exec `cwd`, not what a command itself does. Never expose the Server without the token, and do not run it as a user with access to anything you would not give the agent.

Run the tests with `pnpm test`.
