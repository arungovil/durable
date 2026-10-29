import type { ClientMessage } from "@durable/protocol";
import type { InputEvent } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { handleInput } from "../src/input.ts";

const event = (over: Partial<InputEvent> = {}): InputEvent => ({
  type: "input",
  text: "hello",
  source: "interactive",
  ...over,
});

const setup = (open = true) => {
  const sent: ClientMessage[] = [];
  const notes: string[] = [];
  return {
    sent,
    notes,
    conn: {
      send: (m: ClientMessage) => {
        if (open) sent.push(m);
        return open;
      },
    },
    notify: (m: string) => notes.push(m),
  };
};

it("sends typed text to the Cell and consumes it", () => {
  const { conn, sent, notify } = setup();
  expect(handleInput(event(), conn, notify)).toEqual({ action: "handled" });
  expect(sent).toEqual([
    { type: "prompt", text: "hello", requestId: expect.any(String) },
  ]);
});

it("uses a fresh requestId per prompt", () => {
  const { conn, sent, notify } = setup();
  handleInput(event(), conn, notify);
  handleInput(event(), conn, notify);
  const [a, b] = sent.map((m) => (m.type === "prompt" ? m.requestId : ""));
  expect(a).not.toBe(b);
});

it("passes through outside a session, extension input and slash commands", () => {
  const { conn, sent, notify } = setup();
  const pass = { action: "continue" };
  expect(handleInput(event(), undefined, notify)).toEqual(pass);
  expect(handleInput(event({ source: "extension" }), conn, notify)).toEqual(
    pass,
  );
  expect(handleInput(event({ text: "/durable leave" }), conn, notify)).toEqual(
    pass,
  );
  expect(sent).toEqual([]);
});

it("warns and drops the prompt while the socket is down", () => {
  const { conn, notes, notify } = setup(false);
  expect(handleInput(event(), conn, notify)).toEqual({ action: "handled" });
  expect(notes).toEqual(["not connected to the Cell, prompt not sent"]);
});

it("warns that images are not sent", () => {
  const { conn, sent, notes, notify } = setup();
  const images = [{ type: "image", data: "", mimeType: "image/png" } as const];
  handleInput(event({ images: [...images] }), conn, notify);
  expect(notes).toEqual(["images are not sent to the Cell"]);
  expect(sent).toHaveLength(1);
});
