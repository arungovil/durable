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

## Usage

Start the Server and the Cell (`docs/CELL.md`), then in pi, with the client extension loaded:

```
/durable create                  # prints the join command and joins
/durable join <id> [name]        # on the other machine; name defaults to your OS user
/durable leave                   # disconnect from the session
```

`create` prints just the id when the Cell is the default one, and a full join URL otherwise; `join` takes either. The history so far is shown on join. Status `cell: connected | reconnecting` is in the footer; the client reconnects with backoff (partysocket defaults: 1 to 5s at first, growing to 10s). Prompting from the client arrives in step 6.

| Variable           | Where  | Meaning                                                                                           |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------- |
| `DURABLE_CELL_URL` | client | Cell base URL for `/durable create`. Default `http://127.0.0.1:9876`; an argument overrides both. |
