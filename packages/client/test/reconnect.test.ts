import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReconnectingSocket } from "../src/reconnect.ts";

class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  closed = false;
  url: string;
  constructor(url: string) {
    super();
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  send() {}
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("reopens with growing delay, resets after open, and stops after close()", () => {
  const s = new ReconnectingSocket("ws://x");
  const seen: string[] = [];
  s.addEventListener("close", () => seen.push("close"));
  const last = () => FakeWebSocket.instances.at(-1) as FakeWebSocket;

  last().dispatchEvent(new Event("close"));
  vi.advanceTimersByTime(999);
  expect(FakeWebSocket.instances).toHaveLength(1);
  vi.advanceTimersByTime(1);
  expect(FakeWebSocket.instances).toHaveLength(2);

  last().dispatchEvent(new Event("close")); // second failure waits 2s
  vi.advanceTimersByTime(2000);
  expect(FakeWebSocket.instances).toHaveLength(3);

  last().dispatchEvent(new Event("open")); // success resets the backoff
  last().dispatchEvent(new Event("close"));
  vi.advanceTimersByTime(1000);
  expect(FakeWebSocket.instances).toHaveLength(4);

  s.close();
  last().dispatchEvent(new Event("close"));
  vi.advanceTimersByTime(60_000);
  expect(FakeWebSocket.instances).toHaveLength(4);
  expect(seen).toHaveLength(4);
});

it("forwards messages and refuses to send while not open", () => {
  const s = new ReconnectingSocket("ws://x");
  const data: unknown[] = [];
  s.addEventListener("message", (e) => data.push((e as MessageEvent).data));
  const ws = FakeWebSocket.instances[0] as FakeWebSocket;
  ws.dispatchEvent(new MessageEvent("message", { data: "hi" }));
  expect(data).toEqual(["hi"]);
  expect(() => s.send("x")).toThrow();
});
