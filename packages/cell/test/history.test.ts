import type { EntryRecord } from "@earendil-works/pi-durable";
import { expect, it } from "vitest";
import { PROMPT_KIND, toHistory } from "../src/history.ts";

const entry = (id: string, model?: unknown, kind = "k", data?: unknown) =>
  ({ id, kind, model, data }) as unknown as EntryRecord;

const call = {
  type: "toolCall",
  id: "c1",
  name: "read",
  arguments: { path: "a" },
};
const assistant = { role: "assistant", content: [call] };
const result = {
  role: "toolResult",
  toolCallId: "c1",
  toolName: "read",
  content: [{ type: "text", text: "42" }],
  isError: false,
};

it("keeps the pi message, the prompt author, and a result's call arguments", () => {
  const prompt = { role: "user", content: "ann: hi" };
  const out = toHistory([
    entry("1", [prompt], PROMPT_KIND, { author: "ann", text: "hi" }),
    entry("2", [assistant]),
    entry("3", [result]),
  ]);
  expect(out).toEqual([
    { id: "1", message: prompt, author: "ann" },
    { id: "2", message: assistant },
    { id: "3", message: result, args: { path: "a" } },
  ]);
});

it("skips bookkeeping entries and ones without a model message", () => {
  const out = toHistory([
    entry("1", [{ role: "system", content: "" }]),
    entry("2"),
    entry("3", [{ role: "user", content: "hi" }]),
  ]);
  expect(out.map((e) => e.id)).toEqual(["3"]);
});

it("leaves args off a result whose call is not in the transcript", () => {
  const [only] = toHistory([entry("1", [result])]);
  expect(only?.args).toBeUndefined();
});

it("tolerates a prompt entry without data", () => {
  const [only] = toHistory([
    entry("1", [{ role: "user", content: "x" }], PROMPT_KIND),
  ]);
  expect(only?.author).toBeUndefined();
});
