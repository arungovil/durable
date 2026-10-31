const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 10_000;

/**
 * A WebSocket that reopens itself after any close until `close()` is called.
 * Re-emits `open`, `message` and `close` from each underlying socket, so listeners are added once.
 * `send` throws while the socket is not open; nothing is queued.
 * shortcut: fixed doubling backoff without jitter, add jitter if many clients reconnect together.
 */
export class ReconnectingSocket extends EventTarget {
  #url: string;
  #ws: WebSocket | undefined;
  #retries = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #closed = false;

  constructor(url: string) {
    super();
    this.#url = url;
    this.#open();
  }

  send(data: string): void {
    if (this.#ws?.readyState !== WebSocket.OPEN) {
      throw new Error("socket is not open");
    }
    this.#ws.send(data);
  }

  close(): void {
    this.#closed = true;
    clearTimeout(this.#timer);
    this.#ws?.close();
  }

  #open(): void {
    const ws = new WebSocket(this.#url);
    this.#ws = ws;
    ws.addEventListener("open", () => {
      this.#retries = 0;
      this.dispatchEvent(new Event("open"));
    });
    ws.addEventListener("message", (e) => {
      this.dispatchEvent(new MessageEvent("message", { data: e.data }));
    });
    // A failed connect fires `error` then `close`, so `close` alone drives the retry.
    ws.addEventListener("close", () => {
      this.dispatchEvent(new Event("close"));
      if (this.#closed) return;
      const delay = Math.min(MIN_DELAY_MS * 2 ** this.#retries++, MAX_DELAY_MS);
      this.#timer = setTimeout(() => this.#open(), delay);
    });
  }
}
