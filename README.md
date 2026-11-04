# pairable

Pair programming with [pi](https://github.com/earendil-works/pi). Several people share one agent session, prompt it together, and watch it work on one shared codebase.

> In active development.

## How it works

```
pi client  --WebSocket-->  Cell (celld Durable Object + pi-durable)  --HTTP-->  Server (files, commands)
```

- **client**: a pi extension that joins a shared session.
- **cell**: one Durable Object per session. It runs the agent loop and stores the conversation.
- **web**: a browser client for people without pi. It joins a session, shows the run and sends prompts (`packages/web`).
- **server**: holds the codebase and runs the agent's file and shell tools.

## Development

Requires Node 22.19+, pnpm, and celld.

```
pnpm install --ignore-scripts
pnpm check
pnpm dev:cell
pnpm dev:server
pnpm dev:web
```

celld dev listens on `http://127.0.0.1:9876`; the web client runs on Vite's dev server (the URL `pnpm dev:web` prints). Setup for each process: `docs/CELL.md`, `docs/SERVER.md`.

## Usage

Start the Server and the Cell (`docs/CELL.md`).

**Web:** run `pnpm dev:web` and open the page. Type `/` in the chat box for the commands:

```
/create [your name]            # makes a session; the id is shown in the header (Copy id)
/join <id|url> [your name]     # joins an existing session
/leave                         # leave the session
```

Any other text goes to the shared agent. Your name and session are kept in the browser, so a reload rejoins. `/join` only reaches the default Cell. There is no production build or hosting yet.

**pi:** with the client extension loaded:

```
/pairable create [base-url] [name]   # makes a session, prints the join command and joins
/pairable join <id|url> [name]       # joins an existing session
/pairable leave                      # disconnect from the session
```

- `create` prints `Join with` text containing just the id on the default Cell, or a full URL otherwise. `join` takes either. Whoever has the id can join, so treat it like a password until Cell auth exists.
- `name` is how others see you and how the model addresses you. It defaults to your OS user and may not contain spaces or `:`.
- On join you get the history so far. While joined, text you type goes to the shared agent instead of pi's local one; slash commands still run locally. The model reads each prompt as `name: text`.
- Everyone sees the run as it happens: prompts, replies and tool results. Prompts sent during a run are queued by the Cell. There is no notice for that yet.
- You see `In session: ann, bob` when you join a session that has people in it, and `bob joined` / `bob left` afterwards. These are notices, not part of the shared history.
- The footer shows `pairable: <connecting|connected|reconnecting> · <last 8 chars of the id> · <name>`. The client reconnects with backoff (partysocket defaults: 1 to 5s at first, growing to 10s) and says hello again each time.

| Variable            | Where  | Meaning                                                                                            |
| ------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `PAIRABLE_CELL_URL` | client | Cell base URL for `/pairable create`. Default `http://127.0.0.1:9876`; an argument overrides both. |

## Next steps

- **Queue notice:** tell a user when their prompt is waiting behind a running one.
- **Stop:** `/stop` aborts the current run.
- **Auth:** stable user ids and a token on the connection, so people with the same name stay distinct and the join id is not the only protection.
- **Streaming exec:** live command output instead of waiting for the command to finish.
- **Error visibility:** an unreachable Server shows up as a tool error, not a hang.
- **Limits and cost:** size and rate limits, plus per-run and per-user usage.

## Docs

- `docs/PROTOCOL.md`: every message and endpoint.
- `docs/CELL.md`, `docs/SERVER.md`: setup, config and run for each process.
