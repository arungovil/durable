import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CellEvent } from "@durable/protocol";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
  Harness,
  MemoryStorage,
  watchEvents,
} from "@earendil-works/pi-durable";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createApp } from "../../server/src/app.ts";
import { type Calls, toCellEvents } from "../src/events.ts";
import { harnessOptions } from "../src/harness.ts";
import { PROMPT_KIND } from "../src/history.ts";

const ctx = BACKGROUND_CONTEXT;
let workspace: string;
let url: string;
let close: () => void;

beforeAll(async () => {
  workspace = await realpath(await mkdtemp(join(tmpdir(), "ws-")));
  await writeFile(join(workspace, "a.txt"), "A\n");
  const server = await createApp({ workspace, token: "t" });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());

/** Runs one prompt through a real Harness and returns every event the mapper produced for it. */
async function run(
  responses: Parameters<ReturnType<typeof fauxProvider>["setResponses"]>[0],
): Promise<CellEvent[]> {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses(responses);
  const harness = await Harness.open(
    new MemoryStorage(),
    harnessOptions(models, { url, token: "t", cwd: workspace }),
    ctx,
  );
  const { provider, id } = faux.getModel();
  const root = await harness.root(ctx, {
    agent: { model: { provider, modelId: id } },
  });
  const stream = await watchEvents(harness, root.id, ctx);
  const calls: Calls = new Map();
  const out: CellEvent[] = [];
  stream.start(async (events) => {
    out.push(...toCellEvents(events, calls));
  });
  const sub = await root.submit(
    {
      type: "input",
      content: "ann: go",
      entry: { kind: PROMPT_KIND, data: { author: "ann", text: "go" } },
    },
    ctx,
  );
  await sub.wait(ctx);
  // The last batch is delivered after wait() resolves.
  await new Promise((r) => setTimeout(r, 100));
  await stream.stop();
  await harness.close(ctx);
  return out;
}

const summary = (events: CellEvent[]) =>
  events.map((e) =>
    e.type === "entry"
      ? `entry:${e.entry.message.role}`
      : e.type === "tool_start"
        ? `tool_start:${e.name}`
        : e.type,
  );

it("maps a run with a tool call, in order, without bookkeeping", async () => {
  const events = await run([
    fauxAssistantMessage(fauxToolCall("read", { path: "a.txt" }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(fauxText("It says A.")),
  ]);
  expect(summary(events)).toEqual([
    "entry:user",
    "run_start",
    "entry:assistant",
    "tool_start:read",
    "entry:toolResult",
    "entry:assistant",
    "run_end",
  ]);
  const [prompt, , , start, result] = events;
  expect(prompt).toMatchObject({
    entry: { author: "ann", message: { content: "ann: go" } },
  });
  expect(start).toMatchObject({ args: { path: "a.txt" } });
  expect(result).toMatchObject({
    entry: { args: { path: "a.txt" }, message: { isError: false } },
  });
});

it("sends a failed tool as a result and does not report an error", async () => {
  const events = await run([
    fauxAssistantMessage(fauxToolCall("read", { path: "missing.txt" }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(fauxText("It does not exist.")),
  ]);
  expect(events.some((e) => e.type === "error")).toBe(false);
  expect(events).toContainEqual(
    expect.objectContaining({
      entry: expect.objectContaining({
        message: expect.objectContaining({ isError: true }),
      }),
    }),
  );
});

it("reports a model failure as an error after the run ends", async () => {
  const boom = () =>
    fauxAssistantMessage("", {
      stopReason: "error",
      errorMessage: "provider exploded",
    });
  const events = await run([boom(), boom(), boom(), boom()]);
  expect(summary(events).slice(-2)).toEqual(["run_end", "error"]);
  expect(events.at(-1)).toEqual({
    type: "error",
    message: "model_error: provider exploded",
  });
});
