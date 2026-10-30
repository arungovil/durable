import { DurableObject } from "cloudflare:workers";
import {
  CELL_PATH,
  type CellMessage,
  type ClientMessage,
  type NewCellResponse,
} from "@durable/protocol";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { Harness, type Wake, watchEvents } from "@earendil-works/pi-durable";
import { openDurableObjectSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/cloudflare";

import { type Calls, toCellEvents } from "./events.ts";
import { harnessOptions } from "./harness.ts";
import { PROMPT_KIND, toHistory } from "./history.ts";
import { parseClientMessage } from "./message.ts";

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

/** Per-socket data kept with `serializeAttachment`; absent until the client says hello. */
interface Attachment {
  name: string;
}

export class Cell extends DurableObject<Env> {
  #harness!: Harness;
  /** Tool calls of the current run, so a live result can carry its call's arguments. */
  #calls: Calls = new Map();

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
      await this.#watch();
    });
  }

  override async fetch(_req: Request): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const send = (m: CellMessage) => ws.send(JSON.stringify(m));
    const fail = (message: string) => send({ type: "error", message });
    if (typeof raw !== "string") return fail("binary messages not supported");
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) return fail(parsed.error);
    const msg = parsed.value;
    try {
      if (msg.type === "hello") {
        // The attachment survives hibernation; a field on this object would not.
        ws.serializeAttachment({ name: msg.name } satisfies Attachment);
        const others = this.#names(ws);
        send({
          type: "welcome",
          participants: [...new Set([...others, msg.name])],
        });
        // A second socket under a known name is the same participant.
        if (!others.includes(msg.name))
          this.#broadcast({ type: "joined", name: msg.name }, ws);
        send({ type: "history", entries: await this.#history() });
      } else if (msg.type === "prompt") {
        const who = ws.deserializeAttachment() as Attachment | null;
        if (!who) return fail("send hello first");
        await this.#prompt(who.name, msg);
      }
    } catch (e) {
      fail(e instanceof Error ? e.message : "request failed");
    }
  }

  override async webSocketClose(ws: WebSocket) {
    const who = ws.deserializeAttachment() as Attachment | null;
    if (who && !this.#names(ws).includes(who.name))
      this.#broadcast({ type: "left", name: who.name }, ws);
  }

  /** Names of greeted sockets other than `except`, which may still be listed while it closes. */
  #names(except: WebSocket): string[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== except)
      .flatMap((ws) => {
        const who = ws.deserializeAttachment() as Attachment | null;
        return who ? [who.name] : [];
      });
  }

  #root() {
    return this.#harness.root(context, {
      agent: {
        model: {
          provider: "deepseek",
          modelId: this.env.MODEL ?? "deepseek-flash",
        },
      },
    });
  }

  async #history() {
    const view = await (await this.#root()).viewState(context);
    return toHistory(view.value.entries);
  }

  /**
   * Submits a prompt and returns; the run's output reaches clients through `#watch`.
   * The model reads `name: text`; the entry keeps the author as a field.
   * A repeated `requestId` returns the original submission (pi-durable dedupes).
   */
  async #prompt(name: string, msg: Extract<ClientMessage, { type: "prompt" }>) {
    // TODO(step 6): test the requestId dedupe through the Cell.
    // Armed first, as pi-durable requires for any call that can start work.
    await this.#arm({ ...this.#harness.wake(), active: true });
    const root = await this.#root();
    await root.submit(
      {
        type: "input",
        content: `${name}: ${msg.text}`,
        entry: { kind: PROMPT_KIND, data: { author: name, text: msg.text } },
        requestId: msg.requestId,
      },
      context,
    );
  }

  /**
   * One watch for the whole object. After an eviction the next start watches again and resends
   * history, which covers what happened while nothing watched.
   */
  async #watch() {
    const root = await this.#root();
    const stream = await watchEvents(this.#harness, root.id, context);
    toHistory(stream.snapshot.entries, this.#calls);
    stream.start(async (events) => {
      if (events.some((e) => e.type === "snapshot")) await this.#resync();
      for (const event of toCellEvents(events, this.#calls))
        this.#broadcast({ type: "event", event });
    });
    void stream.closed.then((end) => {
      if (end.reason !== "stopped")
        this.#broadcast({
          type: "error",
          message: `live updates ended (${end.reason}); rejoin the session`,
        });
    });
    if (this.ctx.getWebSockets().length) await this.#resync();
  }

  /** Sends the full history to every greeted socket; clients skip entries they have. */
  async #resync() {
    try {
      this.#broadcast({ type: "history", entries: await this.#history() });
    } catch {
      this.#broadcast({ type: "error", message: "could not refresh history" });
    }
  }

  /** Sends to sockets that said hello, except `except`; a socket still closing must not end the watch. */
  #broadcast(m: CellMessage, except?: WebSocket) {
    const data = JSON.stringify(m);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || !ws.deserializeAttachment()) continue;
      try {
        ws.send(data);
      } catch {}
    }
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
    const { pathname } = new URL(req.url);
    if (pathname === "/new" && req.method === "POST") {
      return Response.json({
        id: crypto.randomUUID(),
      } satisfies NewCellResponse);
    }
    if (!CELL_PATH.test(pathname) || req.headers.get("Upgrade") !== "websocket")
      return new Response("not found", { status: 404 });
    const name = pathname.slice("/cell/".length);
    return env.CELL.get(env.CELL.idFromName(name)).fetch(req);
  },
};
