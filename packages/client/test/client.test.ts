import { expect, it } from "vitest";
import { connect } from "../src/connection.ts";
import { parseCellUrl } from "../src/url.ts";

const ID = "3f2b8c1e-5a47-4d9e-8b21-7c6a90d4e5f1";

it("accepts a valid join URL and maps http to ws", () => {
  expect(parseCellUrl(`http://localhost:8787/cell/${ID}`)).toEqual({
    ok: true,
    value: `ws://localhost:8787/cell/${ID}`,
  });
  expect(parseCellUrl(`wss://cells.example/cell/${ID}`).ok).toBe(true);
});

it("accepts a bare id on the default Cell", () => {
  expect(parseCellUrl(ID)).toEqual({
    ok: true,
    value: `ws://127.0.0.1:9876/cell/${ID}`,
  });
});

it.each([
  "nonsense",
  `ftp://h/cell/${ID}`,
  "http://h/cell/abc",
  `http://h/cell/zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz`,
  `http://h/cell/${ID.toUpperCase()}`,
  `http://h/other/${ID}`,
  `http:///cell/${ID}`,
])("rejects %s", (url) => {
  expect(parseCellUrl(url).ok).toBe(false);
});

class FakeSocket extends EventTarget {
  sent: string[] = [];
  closed = false;
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.closed = true;
  }
}

const setup = () => {
  const ws = new FakeSocket();
  const states: string[] = [];
  const messages: unknown[] = [];
  const errors: string[] = [];
  const conn = connect(
    {
      wsUrl: "ws://x",
      name: "u1",
      onState: (s) => states.push(s),
      onMessage: (m) => messages.push(m),
      onError: (m) => errors.push(m),
    },
    ws as unknown as Parameters<typeof connect>[1],
  );
  return { ws, states, messages, errors, conn };
};

it("says hello on every open and tracks the state", () => {
  const { ws, states } = setup();
  ws.dispatchEvent(new Event("open"));
  ws.dispatchEvent(new Event("close"));
  ws.dispatchEvent(new Event("open"));
  expect(states).toEqual([
    "connecting",
    "connected",
    "reconnecting",
    "connected",
  ]);
  expect(ws.sent).toEqual(
    Array(2).fill(JSON.stringify({ type: "hello", name: "u1" })),
  );
});

it("reports an outage once, and says whether it ever connected", () => {
  const { ws, errors } = setup();
  ws.dispatchEvent(new Event("close"));
  ws.dispatchEvent(new Event("close"));
  expect(errors).toEqual(["cannot reach the Cell, retrying (is it running?)"]);
  ws.dispatchEvent(new Event("open"));
  ws.dispatchEvent(new Event("close"));
  expect(errors).toHaveLength(2);
  expect(errors[1]).toContain("lost");
});

it("passes messages on and ignores malformed frames", () => {
  const { ws, messages } = setup();
  const welcome = { type: "welcome", participants: [] };
  ws.dispatchEvent(
    new MessageEvent("message", { data: JSON.stringify(welcome) }),
  );
  ws.dispatchEvent(new MessageEvent("message", { data: "not json" }));
  expect(messages).toEqual([welcome]);
});

it("close() closes the socket and stays quiet about the close event", () => {
  const { ws, conn, states } = setup();
  conn.close();
  ws.dispatchEvent(new Event("close"));
  expect(ws.closed).toBe(true);
  expect(states).toEqual(["connecting"]);
});
