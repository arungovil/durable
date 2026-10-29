import { expect, it } from "vitest";
import { LIMITS, parseClientMessage } from "../src/message.ts";

const parse = (m: unknown) => parseClientMessage(JSON.stringify(m));

it("accepts hello and prompt", () => {
  expect(parse({ type: "hello", name: "ann" })).toEqual({
    ok: true,
    value: { type: "hello", name: "ann" },
  });
  expect(parse({ type: "prompt", text: "hi", requestId: "r1" })).toEqual({
    ok: true,
    value: { type: "prompt", text: "hi", requestId: "r1" },
  });
});

it("rejects bad names", () => {
  for (const name of [
    "",
    "  ",
    " ann",
    "a b",
    "a:b",
    "a\nb",
    "x".repeat(LIMITS.name + 1),
    7,
  ])
    expect(parse({ type: "hello", name }).ok).toBe(false);
});

it("rejects bad prompts", () => {
  const ok = { type: "prompt", text: "hi", requestId: "r1" };
  for (const bad of [
    { ...ok, text: "" },
    { ...ok, text: " " },
    { ...ok, text: "x".repeat(LIMITS.text + 1) },
    { ...ok, requestId: "" },
    { ...ok, requestId: "x".repeat(LIMITS.requestId + 1) },
    { ...ok, requestId: 1 },
  ])
    expect(parse(bad).ok).toBe(false);
});

it("names the offending field", () => {
  const error = (m: unknown) => {
    const r = parse(m);
    return r.ok ? "" : r.error;
  };
  expect(error({ type: "prompt", text: "hi", requestId: "" })).toMatch(
    /^invalid requestId:/,
  );
  expect(error({ type: "prompt", text: " ", requestId: "r" })).toMatch(
    /^invalid text:/,
  );
  expect(error({ type: "hello", name: "a b" })).toMatch(/^invalid name:/);
  expect(error({ type: "hello", name: "ann", extra: 1 })).toMatch(
    /^invalid extra:/,
  );
  expect(error({ type: "nope" })).toBe("unknown message type");
});

it("rejects unknown fields", () => {
  expect(parse({ type: "hello", name: "ann", extra: 1 }).ok).toBe(false);
  expect(
    parse({ type: "prompt", text: "hi", requestId: "r1", extra: 1 }).ok,
  ).toBe(false);
});

it("rejects malformed frames", () => {
  expect(parseClientMessage("{nope").ok).toBe(false);
  expect(parseClientMessage("null").ok).toBe(false);
  expect(parseClientMessage("x".repeat(LIMITS.message + 1)).ok).toBe(false);
  expect(parse({ type: "other" }).ok).toBe(false);
});
