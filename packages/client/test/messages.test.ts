import type { CellMessage, HistoryEntry } from "@durable/protocol";
import { expect, it } from "vitest";
import { createHandler } from "../src/messages.ts";

const user: HistoryEntry = {
  id: "1",
  message: { role: "user", content: "ann: hi", timestamp: 0 },
  author: "ann",
};
const result: HistoryEntry = {
  id: "3",
  message: {
    role: "toolResult",
    toolCallId: "c",
    toolName: "read",
    content: [],
    isError: false,
    timestamp: 0,
  },
};

const setup = () => {
  const appended: string[] = [];
  const notes: string[] = [];
  const runs: (string | undefined)[] = [];
  const handle = createHandler({
    append: (e) => appended.push(e.id),
    notify: (m) => notes.push(m),
    setRun: (t) => runs.push(t),
  });
  return { handle, appended, notes, runs };
};

const event = (e: Extract<CellMessage, { type: "event" }>["event"]) =>
  ({ type: "event", event: e }) as const;

it("shows an entry once, whether it came in history or live", () => {
  const { handle, appended } = setup();
  handle({ type: "history", entries: [user] });
  handle(event({ type: "entry", entry: user }));
  handle({ type: "history", entries: [user, result] });
  expect(appended).toEqual(["1", "3"]);
});

it("follows a run in the status line", () => {
  const { handle, runs } = setup();
  handle(event({ type: "run_start" }));
  handle(event({ type: "tool_start", id: "c", name: "read", args: {} }));
  handle(event({ type: "entry", entry: result }));
  handle(event({ type: "run_end" }));
  expect(runs).toEqual([
    "working...",
    "running read...",
    "working...",
    undefined,
  ]);
});

it("reports errors and clears the status", () => {
  const { handle, notes, runs } = setup();
  handle(event({ type: "error", message: "model_error: boom" }));
  handle({ type: "error", message: "bad message" });
  expect(notes).toEqual(["model_error: boom", "bad message"]);
  expect(runs).toEqual([undefined]);
});

it("announces who is here, who joined and who left", () => {
  const { handle, notes } = setup();
  handle({ type: "welcome", participants: ["ann"] });
  handle({ type: "welcome", participants: ["ann", "bob"] });
  handle({ type: "joined", name: "cy" });
  handle({ type: "left", name: "bob" });
  expect(notes).toEqual(["In session: ann, bob", "cy joined", "bob left"]);
});
