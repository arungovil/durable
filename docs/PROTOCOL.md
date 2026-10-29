# Protocol

Types live in `packages/protocol/src/index.ts`; this file is the human summary.

## Client <-> Cell

`POST /new` on the Cell base URL creates a session and answers `{"id":"<uuid>"}` (`NewCellResponse`). The WebSocket is at `/cell/<id>`; any other path, or an id that is not a lowercase v4 UUID, is 404. The unguessable id makes the join URL (`<base>/cell/<id>`) the invite, until step 9 adds a token. Clients accept `http(s)` and `ws(s)` join URLs, or a bare id, which joins on the default Cell (`http://127.0.0.1:9876` until there is a hosted one).

On `hello` the Cell answers `welcome`, then `history`. A reconnect gets the full history again; clients skip entry ids they have shown.

| Direction      | Message           | Example                                                                                                      |
| -------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| client -> cell | `hello`           | `{"type":"hello","name":"u1"}`                                                                               |
| client -> cell | `prompt`          | `{"type":"prompt","text":"fix the bug","requestId":"r1"}`                                                    |
| cell -> client | `welcome`         | `{"type":"welcome","participants":["u1"]}`                                                                   |
| cell -> client | `history`         | `{"type":"history","entries":[{"id":"e1","role":"user","text":"hi"}]}` (`role`: `user`, `assistant`, `tool`) |
| cell -> client | `event`           | `{"type":"event","event":{}}` (event shape: step 7)                                                          |
| cell -> client | `joined` / `left` | `{"type":"joined","name":"u2"}`                                                                              |
| cell -> client | `error`           | `{"type":"error","message":"bad message"}`                                                                   |

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
