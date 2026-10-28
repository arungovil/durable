import { DurableObject } from "cloudflare:workers";
import type { CellMessage, ClientMessage } from "@durable/protocol";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { Harness, type Wake } from "@earendil-works/pi-durable";
import { openDurableObjectSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/cloudflare";

import { harnessOptions } from "./harness.ts";

const context = BACKGROUND_CONTEXT;
const HEARTBEAT_MS = 60_000;

interface Env {
  CELL: DurableObjectNamespace<Cell>;
  /** Base URL of the Server, no trailing slash. */
  SERVER_URL: string;
  SERVER_TOKEN: string;
  /** Absolute workspace path on the Server. */
  SERVER_CWD: string;
  DEEPSEEK_API_KEY: string;
  /** pi-ai DeepSeek model id; defaults to `deepseek-flash`. */
  MODEL?: string;
}

// Layer 2: one Cell per shared session. Hosts the pi-durable Harness on this object's SQLite storage.
export class Cell extends DurableObject<Env> {
  #harness!: Harness;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      // A fallback before anything can throw: an object whose open or recovery fails is started again.
      const fallback = Date.now() + HEARTBEAT_MS;
      const current = await ctx.storage.getAlarm();
      if (current === null || current > fallback)
        await ctx.storage.setAlarm(fallback);
      // The provider reads its key from process.env.
      process.env.DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY;
      const models = createModels();
      models.setProvider(deepseekProvider());
      this.#harness = await Harness.open(
        await openDurableObjectSqliteStorage(ctx.storage),
        {
          ...harnessOptions(models, {
            url: env.SERVER_URL,
            token: env.SERVER_TOKEN,
            cwd: env.SERVER_CWD,
          }),
          // A failed alarm write resets the object; it arms again when it next starts.
          onWake: (wake) =>
            void this.#arm(wake).catch(() => ctx.abort("Alarm write failed")),
        },
        context,
      );
      await this.#arm(this.#harness.wake());
      this.#harness.resume();
    });
  }

  override async fetch(_req: Request): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const send = (m: CellMessage) => ws.send(JSON.stringify(m));
    try {
      const msg = JSON.parse(String(raw)) as ClientMessage;
      if (msg.type === "hello") send({ type: "welcome", participants: [] });
      else if (msg.type === "prompt")
        send({ type: "history", entries: await this.#prompt(msg) });
    } catch (e) {
      send({
        type: "error",
        message: e instanceof Error ? e.message : "bad message",
      });
    }
  }

  /** Runs one prompt to its answer and returns the transcript. */
  async #prompt(msg: Extract<ClientMessage, { type: "prompt" }>) {
    // TODO(step 6): validate, tag the sender, dedupe by requestId.
    // TODO(step 7): stream events instead of replying once.
    const root = await this.#harness.root(context, {
      agent: {
        model: {
          provider: "deepseek",
          modelId: this.env.MODEL ?? "deepseek-flash",
        },
      },
    });
    const sub = await root.submit(
      { type: "input", content: msg.text, requestId: msg.requestId },
      context,
    );
    await sub.wait(context);
    const view = await root.viewState(context);
    return [...view.value.entries];
  }

  override async alarm(): Promise<void> {
    await this.#arm({ ...this.#harness.wake(), active: true });
    this.#harness.resume(); // due sleeps and work a lost instance left
  }

  async #arm(wake: Wake): Promise<void> {
    // A recovery heartbeat while work runs, never later than the earliest sleep.
    const heartbeat = wake.active ? Date.now() + HEARTBEAT_MS : undefined;
    const at =
      heartbeat === undefined || wake.at === undefined
        ? (heartbeat ?? wake.at)
        : Math.min(heartbeat, wake.at);
    if (at === undefined) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(at);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const m = new URL(req.url).pathname.match(/^\/cell\/([\w-]{1,64})$/);
    if (!m || req.headers.get("Upgrade") !== "websocket")
      return new Response("not found", { status: 404 });
    return env.CELL.get(env.CELL.idFromName(m[1])).fetch(req);
  },
};
