# Protocol

Types live in `packages/protocol/src/index.ts`; this file is the human summary.

## Client <-> Cell

`POST /new` on the Cell base URL creates a session and answers `{"id":"<uuid>"}` (`NewCellResponse`). The WebSocket is at `/cell/<id>`; any other path, or an id that is not a lowercase v4 UUID, is 404. The unguessable id makes the join URL (`<base>/cell/<id>`) the invite, until the Cell has its own auth. Clients accept `http(s)` and `ws(s)` join URLs, or a bare id, which joins on the default Cell (`http://127.0.0.1:9876` until there is a hosted one).

On `hello` the Cell answers `welcome` (every name now connected, including the new one), then `history`, and tells the other sockets `joined`. A reconnect gets the full history again; clients skip entry ids they have shown.

`left` goes out when a name's last socket closes. Two sockets under one name count as one participant, so two users with the same name show once.

| Direction      | Message           | Example                                                                                                                           |
| -------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| client -> cell | `hello`           | `{"type":"hello","name":"u1"}`                                                                                                    |
| client -> cell | `prompt`          | `{"type":"prompt","text":"fix the bug","requestId":"r1"}`                                                                         |
| cell -> client | `welcome`         | `{"type":"welcome","participants":["u1"]}`                                                                                        |
| cell -> client | `history`         | `{"type":"history","entries":[{"id":"7","message":{"role":"user","content":"ann: hi"},"author":"ann"}]}` (see Transcript entries) |
| cell -> client | `event`           | `{"type":"event","event":{"type":"run_start"}}` (see Live events)                                                                 |
| cell -> client | `joined` / `left` | `{"type":"joined","name":"u2"}`                                                                                                   |
| cell -> client | `error`           | `{"type":"error","message":"unknown message type"}`                                                                               |

### Validation

The Cell validates every frame (`packages/cell/src/message.ts`) and answers a bad one with `error` to that socket only; the socket stays open. Frames are text JSON; a binary frame is an error. Unknown fields are rejected.

| Field       | Rule                                                                            |
| ----------- | ------------------------------------------------------------------------------- |
| frame       | at most 32768 characters; a `type` of `hello` or `prompt`                       |
| `name`      | 1-32 characters, no whitespace, control characters or `:`                       |
| `text`      | at most 16384 characters, not blank                                             |
| `requestId` | 1-64 characters; the client makes a fresh one per prompt and reuses it to retry |

Errors name the field, for example `invalid requestId: must not have fewer than 1 characters`. A `prompt` before `hello` is answered with `send hello first`. The name is kept on the socket until it closes, so a client says `hello` again on every reconnect.

### Prompts and senders

The Cell takes the sender from the socket's `hello`, never from the prompt, so a client cannot speak as someone else. `name` may not contain `:` so it cannot fake a sender inside the text. Each prompt is submitted to pi-durable as an input:

- `content` is `<name>: <text>`, which is what the model reads (`ann: can you check the build?`).
- `entry` is `{"kind":"chat.message","data":{"author":"<name>","text":"<text>"}}`, so the transcript keeps the author as a field.
- `requestId` is passed through. pi-durable returns the original submission for a repeated id, so a retry does not run twice.

### Transcript entries

A `history` entry (`HistoryEntry`) is one finished item of the conversation, in the form pi draws it:

- `id`: stable across reconnects; clients skip ids they have shown.
- `message`: a pi-ai message with role `user`, `assistant` or `toolResult`. An assistant message carries its text, thinking and tool calls; a tool result carries `content`, `isError` and `durationMs`. A prompt reads `<author>: <text>`.
- `author`: who sent a user prompt; absent otherwise.
- `args`: on a tool result, the arguments of the call it answers, so a client can draw the whole tool box. Absent if the call is not in the transcript.

Bookkeeping entries (the system message that lists tools) are never sent.

### Live events

A `prompt` is answered by nothing directly: the Cell submits it and returns. Everything the run does reaches every client that has said hello, as `event` messages (`CellEvent`), one per finished item. Text is not streamed token by token; a message arrives when the model finishes it, a tool result when the tool finishes.

| `event.type` | Fields                   | When                                                                                                                                               |
| ------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entry`      | `entry` (`HistoryEntry`) | A prompt, an assistant message, or a tool result is stored. An assistant message that failed has `stopReason: "error"`.                            |
| `tool_start` | `id`, `name`, `args`     | A tool call began. Its result follows as an `entry` with the same `toolCallId`. Parallel calls finish in any order.                                |
| `run_start`  |                          | The agent began working on queued input.                                                                                                           |
| `run_end`    |                          | That run finished, with or without an answer.                                                                                                      |
| `error`      | `message`                | A run could not be answered, e.g. `model_error: <detail>`, or a task failed. A failed tool is not an error: it is an `entry` with `isError: true`. |

Order within a run: `entry` (the prompt), `run_start`, then per model turn an assistant `entry`, a `tool_start` and result `entry` for each call, and finally `run_end` (and `error` if it failed).

**Joining and missing events.** A socket receives events from the moment it says `hello`, and then a `history` read after that, so nothing falls between the two; an entry that arrives both ways has the same `id`, and clients show it once. After the Cell restarts or wakes from hibernation it starts a new watch and sends `history` again to every connected socket, for anything that happened while nothing watched. The same happens when the Cell fell too far behind to send every event. Events from the dead window (such as `tool_start`) are not replayed; their entries are in the history.

### Client input

While joined, the pi extension sends typed text as `prompt` instead of running pi's local agent. Slash commands and input from extensions pass through to pi, as does everything when not joined. If the socket is down the prompt is dropped with a warning, not queued, so it cannot reach the Cell before `hello`. Images are not sent.

## Cell -> Server (HTTP POST, JSON, `Authorization: Bearer <token>`)

Every route answers 200 with `{"ok":true,"value":...}` or `{"ok":false,"error":{"code","message","path?"}}`. Wrong or missing token: 401. `GET /health` needs no token.

| Route       | Request                       | Value                                   |
| ----------- | ----------------------------- | --------------------------------------- |
| `/fs/read`  | `{path, offset?, length?}`    | `{dataBase64}`                          |
| `/fs/write` | `{path, dataBase64}`          | `{}`                                    |
| `/fs/info`  | `{path}`                      | `{name, path, kind, size, mtimeMs}`     |
| `/exec`     | `{command, cwd?, timeoutMs?}` | `{exitCode, stdout, stderr, truncated}` |

Error codes match pi-durable's file and execution codes.

## Cell `ExecutionEnv` adapter (`HttpExecutionEnv`)

Implements pi-durable's `ExecutionEnv` over the routes above, built from the Server URL (also its `id`), token, and the workspace's absolute path (`cwd`). Tool paths resolve lexically against `cwd`; the Server does the confinement.

| Supported                                                           | Notes                                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `readTextFile`, `readBinaryFile`, `writeFile`, `fileInfo`, `exists` | `exists` is `fileInfo` with `not_found` as `false`.                                                                             |
| `openBinaryReader`                                                  | Ranged `/fs/read` calls; `scanLines` streams the file in 256 KiB chunks. No `noFollow`.                                         |
| `exec`                                                              | Buffered: output is delivered after the command ends, stdout before stderr. `env`, `inheritEnv`, `spill`, `window` are ignored. |
| `absolutePath`, `joinPath`, `cleanup`                               | Local; no request.                                                                                                              |

Everything else (`canonicalPath`, `openTextLineReader`, `readTextLines`, `appendFile`, `truncateFile`, `flushFile`, `renameFile`, `listDir`, `listFiles`, `openDirReader`, `watch`, `createDir`, `remove`, `createTempDir`, `createTempFile`) fails with `not_supported`. Transport failures and non-200 replies become `unknown`; an aborted signal becomes `aborted`.
