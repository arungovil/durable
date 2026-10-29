import type { HistoryEntry } from "@durable/protocol";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { beforeAll, expect, it } from "vitest";
import { renderEntry } from "../src/render.ts";

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI colour codes
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const draw = (e: HistoryEntry, expanded = false) =>
  renderEntry(e, expanded)
    .render(80)
    .map((l) => strip(l).trimEnd())
    .join("\n");

beforeAll(() => initTheme());

const result = (over: Partial<HistoryEntry["message"]> = {}): HistoryEntry => ({
  id: "3",
  args: { path: "a.txt" },
  message: {
    role: "toolResult",
    toolCallId: "c1",
    toolName: "read",
    content: [{ type: "text", text: "line one" }],
    isError: false,
    timestamp: 0,
    ...over,
  } as HistoryEntry["message"],
});

it("draws a user prompt with its author", () => {
  const out = draw({
    id: "1",
    author: "ann",
    message: { role: "user", content: "ann: read both", timestamp: 0 },
  });
  expect(out).toContain("ann: read both");
});

it("draws assistant text as markdown, without the tool call part", () => {
  const out = draw({
    id: "2",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "Reading **a.txt**:\n\n- one" },
        {
          type: "toolCall",
          id: "c1",
          name: "read",
          arguments: { path: "a.txt" },
        },
      ],
    } as HistoryEntry["message"],
  });
  expect(out).toContain("Reading a.txt");
  expect(out).toContain("- one");
  expect(out).not.toContain("toolCall");
});

it("draws a tool result as pi's tool box, with output only when expanded", () => {
  expect(draw(result())).toContain("read a.txt");
  expect(draw(result())).not.toContain("line one");
  expect(draw(result(), true)).toContain("line one");
});

it("draws a bash result and a failed result", () => {
  const bash = result({ toolName: "bash" });
  expect(draw({ ...bash, args: { command: "echo hi" } })).toContain(
    "$ echo hi",
  );
  const failed = result({
    toolName: "bash",
    isError: true,
    content: [{ type: "text", text: "exit 1" }],
  });
  expect(draw({ ...failed, args: { command: "false" } })).toContain("exit 1");
});

it("draws a tool it has no renderer for, and a result with no args", () => {
  expect(draw(result({ toolName: "mystery" }))).toContain("mystery");
  expect(() => draw({ ...result(), args: undefined })).not.toThrow();
});
