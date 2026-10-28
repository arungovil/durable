import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { Harness, MemoryStorage } from "@earendil-works/pi-durable";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createApp } from "../../server/src/app.ts";
import { harnessOptions } from "../src/harness.ts";

const ctx = BACKGROUND_CONTEXT;
let workspace: string;
let url: string;
let close: () => void;

beforeAll(async () => {
  workspace = await realpath(await mkdtemp(join(tmpdir(), "ws-")));
  const server = await createApp({ workspace, token: "t" });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());

it("runs a read tool call on the Server and stores the answer", async () => {
  await writeFile(join(workspace, "secret.txt"), "the answer is 42\n");
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const seen: string[] = [];
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read", { path: "secret.txt" }), {
      stopReason: "toolUse",
    }),
    (transcript) => {
      seen.push(JSON.stringify(transcript));
      return fauxAssistantMessage(fauxText("It says 42."));
    },
  ]);

  const harness = await Harness.open(
    new MemoryStorage(),
    harnessOptions(models, { url, token: "t", cwd: workspace }),
    ctx,
  );
  const { provider, id } = faux.getModel();
  const root = await harness.root(ctx, {
    agent: { model: { provider, modelId: id } },
  });
  const submission = await root.submit(
    { type: "input", content: "what is in secret.txt?" },
    ctx,
  );
  const settled = await submission.wait(ctx);
  const { entries } = (await root.viewState(ctx)).value;
  await harness.close(ctx);

  expect(settled.status).toBe("done");
  expect(seen[0]).toContain("the answer is 42");
  expect(JSON.stringify(entries.at(-1))).toContain("It says 42.");
});
