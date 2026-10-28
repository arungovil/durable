# durable

Multiplayer programming with pi: several people drive one shared agent session.

```
client (pi extension)  --WebSocket-->  cell (celld Durable Object + pi-durable Harness)  --HTTP-->  server (files + tool runs)
```

| Package             | Layer | Role                                                                                 |
| ------------------- | ----- | ------------------------------------------------------------------------------------ |
| `packages/client`   | 1     | pi extension; `/pair <url>` joins a Cell                                             |
| `packages/cell`     | 2     | one Durable Object per session; hosts the pi-durable `Harness` on its SQLite storage |
| `packages/server`   | 3     | owns workspace files, runs tools                                                     |
| `packages/protocol` | -     | wire types shared by all layers                                                      |

## Commands

- `pnpm install --ignore-scripts`
- `pnpm check` - biome + `tsc -b`
- `pnpm dev:cell` - `celld dev` on the Cell
- `pnpm dev:server` - server on `:8788`

## Conventions

Erasable TypeScript only (Node strip-only), no `any`, top-level imports, exact-pinned deps, biome via `pnpm format`.
