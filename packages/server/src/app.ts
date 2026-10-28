import { realpath } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { ExecRequest } from "@durable/protocol";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { fail } from "./result.ts";
import type { Handler } from "./routes/handler.ts";
import { createRoutes } from "./routes/index.ts";

export interface ServerConfig {
  /** Root directory; every path a request names must resolve inside it. */
  workspace: string;
  /** Bearer token required on every route except `/health`. */
  token: string;
}

const MAX_BODY_BYTES = 64 * 1024 * 1024;

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Resolves the workspace once, then serves. The returned server is not yet listening. */
export async function createApp(config: ServerConfig): Promise<Server> {
  const root = await realpath(config.workspace);
  const env = new NodeExecutionEnv({ cwd: root });
  const handlers = createRoutes(root, env);
  const expected = `Bearer ${config.token}`;

  return createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    };
    const url = req.url ?? "";
    if (req.method === "GET" && url === "/health") {
      res.end("ok");
      return;
    }
    // shortcut: plain string compare leaks timing, upgrade to timingSafeEqual before exposing beyond a private network
    if (req.headers.authorization !== expected) {
      send(401, fail("permission_denied", "missing or wrong token"));
      return;
    }
    const handler = Object.hasOwn(handlers, url)
      ? handlers[url as keyof typeof handlers]
      : undefined;
    if (req.method !== "POST" || !handler) {
      send(404, fail("not_found", `no route ${req.method} ${url}`));
      return;
    }
    // Client went away (aborted fetch): kill the command and stop work.
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (e) {
      send(400, fail("invalid", (e as Error).message));
      return;
    }
    if (typeof body !== "object" || body === null) {
      send(400, fail("invalid", "body must be a JSON object"));
      return;
    }
    try {
      // The handler is picked by route; its request type is only checked by the shape of the JSON the Cell sends.
      send(
        200,
        await (handler as Handler<"/exec">)(body as ExecRequest, abort.signal),
      );
    } catch (e) {
      send(500, fail("unknown", (e as Error).message));
    }
  });
}
