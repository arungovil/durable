# Server

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
