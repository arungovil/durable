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
): { close: () => void } {
  let closed = false;
  let opened = false;
  let reported = false;
  opts.onState("connecting");
  ws.addEventListener("open", () => {
    opened = true;
    reported = false;
    opts.onState("connected");
    const hello: ClientMessage = { type: "hello", name: opts.name };
    ws.send(JSON.stringify(hello));
  });
  ws.addEventListener("close", () => {
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
    close() {
      closed = true;
      ws.close();
    },
  };
}
