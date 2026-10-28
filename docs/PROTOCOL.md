# Protocol

Types live in `packages/protocol/src/index.ts`; this file is the human summary.

## Client <-> Cell (WebSocket at `/cell/<name>`)

| Direction      | Message           | Example                                                   |
| -------------- | ----------------- | --------------------------------------------------------- |
| client -> cell | `hello`           | `{"type":"hello","name":"u1"}`                            |
| client -> cell | `prompt`          | `{"type":"prompt","text":"fix the bug","requestId":"r1"}` |
| cell -> client | `welcome`         | `{"type":"welcome","participants":["u1"]}`                |
| cell -> client | `history`         | `{"type":"history","entries":[]}` (entry shape: step 5)   |
| cell -> client | `event`           | `{"type":"event","event":{}}` (event shape: step 7)       |
| cell -> client | `joined` / `left` | `{"type":"joined","name":"u2"}`                           |
| cell -> client | `error`           | `{"type":"error","message":"bad message"}`                |

## Cell -> Server (HTTP POST, JSON, `Authorization: Bearer <token>`)

Every route answers 200 with `{"ok":true,"value":...}` or `{"ok":false,"error":{"code","message","path?"}}`. Wrong or missing token: 401. `GET /health` needs no token.

| Route       | Request                       | Value                                   |
| ----------- | ----------------------------- | --------------------------------------- |
| `/fs/read`  | `{path, offset?, length?}`    | `{dataBase64}`                          |
| `/fs/write` | `{path, dataBase64}`          | `{}`                                    |
| `/fs/info`  | `{path}`                      | `{name, path, kind, size, mtimeMs}`     |
| `/exec`     | `{command, cwd?, timeoutMs?}` | `{exitCode, stdout, stderr, truncated}` |

Error codes match pi-durable's file and execution codes.
