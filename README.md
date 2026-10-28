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

celld dev listens on `http://127.0.0.1:9876`. Setup for each process: `docs/CELL.md`, `docs/SERVER.md`.
