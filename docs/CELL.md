# Cell

One Durable Object per shared session. It hosts the pi-durable Harness on its SQLite storage and runs the agent loop; file and shell tools execute on the Server through `HttpExecutionEnv` (`docs/PROTOCOL.md`).

## Bindings

Local values go in `packages/cell/.dev.vars` (gitignored, never commit a key). Copy `.dev.vars.example` and fill it in.

| Binding            | Meaning                                                                            |
| ------------------ | ---------------------------------------------------------------------------------- |
| `SERVER_URL`       | Base URL of the Server, no trailing slash (`http://127.0.0.1:8788`).               |
| `SERVER_TOKEN`     | The Server's `TOKEN`.                                                              |
| `SERVER_CWD`       | Absolute path of the Server's `WORKSPACE`; tool paths resolve here.                |
| `DEEPSEEK_API_KEY` | DeepSeek key. Copied to `process.env` for pi-ai's provider.                        |
| `MODEL`            | Optional pi-ai DeepSeek model id: `deepseek-flash` (default) or `deepseek-v4-pro`. |

```
SERVER_URL=http://127.0.0.1:8788
SERVER_TOKEN=secret
SERVER_CWD=/path/to/scratch-workspace
DEEPSEEK_API_KEY=sk-...
```

## Run

```
WORKSPACE=/path/to/scratch-workspace TOKEN=secret pnpm dev:server
pnpm dev:cell        # celld dev, http://127.0.0.1:9876
```

Use the pi client (`README.md`), or any WebSocket client: `POST /new` on `http://127.0.0.1:9876` returns `{"id":"<uuid>"}`; connect to `ws://127.0.0.1:9876/cell/<id>`, send `{"type":"hello","name":"u1"}`, then `{"type":"prompt","text":"...","requestId":"r1"}`. You get `welcome` and `history` first, then `event` messages as the run happens (`docs/PROTOCOL.md`).

## Tests

The Harness wiring lives in `src/harness.ts`, which does not import `cloudflare:workers`. Tests open it in Node with `MemoryStorage`, pi-ai's `fauxProvider` and the real Server, so they spend no tokens. The Durable Object glue in `src/index.ts` is checked by running `celld dev`, not by vitest.

In a scripted faux response, a tool call needs `stopReason: "toolUse"`, otherwise the run ends after that response.
