import type { EntryRecord } from "@earendil-works/pi-durable";
import { expect, it } from "vitest";
import { toHistory } from "../src/history.ts";

const entry = (id: string, model?: unknown) =>
  ({ id, kind: "k", model }) as unknown as EntryRecord;

it("flattens messages and skips entries without one", () => {
  const out = toHistory([
    entry("1", [{ role: "user", content: "hi" }]),
    entry("2", [
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "hm" },
          { type: "text", text: "reading" },
          { type: "toolCall", name: "read" },
        ],
      },
    ]),
    entry("3", [
      { role: "toolResult", content: [{ type: "text", text: "42" }] },
    ]),
    entry("4"),
  ]);
  expect(out).toEqual([
    { id: "1", role: "user", text: "hi" },
    { id: "2", role: "assistant", text: "reading\n[tool: read]" },
    { id: "3", role: "tool", text: "42" },
  ]);
});
