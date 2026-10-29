import type { CellMessage, ClientMessage } from "@durable/protocol";
import ReconnectingWebSocket from "partysocket/ws";

export type ConnectionState = "connecting" | "connected" | "reconnecting";

export interface ConnectionOptions {
  wsUrl: string;
  name: string;
  onMessage: (m: CellMessage) => void;
  onState: (s: ConnectionState) => void;
  /** Called once per outage, not on every retry. */
  onError: (message: string) => void;
}

export interface Connection {
  /** False when the socket is not open; nothing is queued, so the caller decides what to tell the user. */
  send: (m: ClientMessage) => boolean;
  close: () => void;
}

/**
 * Keeps one socket to a Cell open and says hello on every (re)connect.
 * `ws` is a parameter so tests can pass a fake; reconnect backoff is partysocket's.
 */
export function connect(
  opts: ConnectionOptions,
  ws: Pick<
    ReconnectingWebSocket,
    "addEventListener" | "send" | "close"
  > = new ReconnectingWebSocket(opts.wsUrl),
): Connection {
  let closed = false;
  let opened = false;
  let reported = false;
  let open = false;
  opts.onState("connecting");
  ws.addEventListener("open", () => {
    opened = true;
    open = true;
    reported = false;
    opts.onState("connected");
    const hello: ClientMessage = { type: "hello", name: opts.name };
    ws.send(JSON.stringify(hello));
  });
  ws.addEventListener("close", () => {
    open = false;
    if (closed) return;
    opts.onState("reconnecting");
    if (reported) return;
    reported = true;
    opts.onError(
      opened
        ? "connection to the Cell lost, reconnecting"
        : "cannot reach the Cell, retrying (is it running?)",
    );
  });
  ws.addEventListener("message", (e) => {
    try {
      opts.onMessage(JSON.parse(String(e.data)) as CellMessage);
    } catch {
      // a malformed frame must not drop the connection
    }
  });
  return {
    send(m) {
      // The socket would queue a send while down and flush it ahead of hello, which the Cell rejects.
      if (!open) return false;
      ws.send(JSON.stringify(m));
      return true;
    },
    close() {
      closed = true;
      ws.close();
    },
  };
}
