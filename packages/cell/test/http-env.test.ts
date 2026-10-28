import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BACKGROUND_CONTEXT,
  withAbortSignal,
} from "@earendil-works/chord/context";
import type { ToolExecutionApi } from "@earendil-works/pi-durable";
import { getOrThrow } from "@earendil-works/pi-durable/env";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../server/src/app.ts";
import { HttpExecutionEnv } from "../src/http-env.ts";

const ctx = BACKGROUND_CONTEXT;
let workspace: string;
let env: HttpExecutionEnv;
let close: () => void;

beforeAll(async () => {
  workspace = await realpath(await mkdtemp(join(tmpdir(), "ws-")));
  const server = await createApp({ workspace, token: "t" });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  env = new HttpExecutionEnv({ url, token: "t", cwd: workspace });
  close = () => server.close();
});

afterAll(() => close());

describe("methods", () => {
  it("writes, reads and stats a file", async () => {
    getOrThrow(await env.writeFile("a/b.txt", "héllo\nworld", ctx));
    expect(await readFile(join(workspace, "a/b.txt"), "utf8")).toBe(
      "héllo\nworld",
    );
    expect(getOrThrow(await env.readTextFile("a/b.txt", ctx))).toBe(
      "héllo\nworld",
    );
    const info = getOrThrow(await env.fileInfo("a/b.txt", ctx));
    expect(info).toMatchObject({ kind: "file", size: 12 });
    expect(getOrThrow(await env.exists("a/b.txt", ctx))).toBe(true);
    expect(getOrThrow(await env.exists("nope", ctx))).toBe(false);
  });

  it("maps server errors to FileError codes", async () => {
    const missing = await env.readTextFile("nope", ctx);
    expect(!missing.ok && missing.error.code).toBe("not_found");
    const escaped = await env.readTextFile("../outside", ctx);
    expect(!escaped.ok && escaped.error.code).toBe("permission_denied");
    const dir = await env.openBinaryReader("a", undefined, ctx);
    expect(!dir.ok && dir.error.code).toBe("is_directory");
  });

  it("resolves paths lexically against cwd", async () => {
    expect(getOrThrow(await env.absolutePath("x/../y", ctx))).toBe(
      `${workspace}/y`,
    );
    expect(getOrThrow(await env.absolutePath("/z", ctx))).toBe("/z");
    expect(getOrThrow(await env.joinPath(["/a/b", ".."], ctx))).toBe("/a");
  });

  it("reads ranges and scans lines through the binary reader", async () => {
    await writeFile(join(workspace, "lines.txt"), "one\ntwo\nthree");
    const reader = getOrThrow(
      await env.openBinaryReader("lines.txt", undefined, ctx),
    );
    expect(
      new TextDecoder().decode(getOrThrow(await reader.read(4, 3, ctx))),
    ).toBe("two");
    const scan = getOrThrow(
      await reader.scanLines({ startLine: 1, endLine: 2 }, ctx),
    );
    expect(scan).toMatchObject({ newlines: 2, start: 4, end: 7 });
  });

  it("returns nonzero exits as results and passes cwd", async () => {
    let out = "";
    const r = getOrThrow(
      await env.exec("pwd; exit 3", { onOutput: (t) => (out += t) }, ctx),
    );
    expect(r.exitCode).toBe(3);
    expect(out.trim()).toBe(workspace);
  });

  it("aborts exec, timeouts, and reports unsupported methods", async () => {
    const ac = new AbortController();
    const pending = env.exec(
      "sleep 5",
      undefined,
      withAbortSignal(ac.signal, ctx),
    );
    ac.abort();
    const aborted = await pending;
    expect(!aborted.ok && aborted.error.code).toBe("aborted");
    const slow = await env.exec("sleep 5", { timeout: 0.2 }, ctx);
    expect(!slow.ok && slow.error.code).toBe("timeout");
    const l = await env.listDir(".", ctx);
    expect(!l.ok && l.error.code).toBe("not_supported");
  });
});

describe("pi-durable tools", () => {
  // Only `env`, `output`, `diagnostic` and `retainedOutput` are reached by these four tools.
  const chunks: string[] = [];
  const api = {
    env,
    outputWindow: undefined,
    output: (c: string | Uint8Array) => void chunks.push(String(c)),
    retainedOutput: () => ({ text: chunks.join(""), truncated: false }),
    diagnostic: () => {},
    details: async () => {},
  } as unknown as ToolExecutionApi;
  const run = async (name: string, args: object) => {
    const tool = CodingTools.tools?.find((t) => t.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    return tool.execute(
      args as never,
      { ...api, env } as ToolExecutionApi,
      ctx,
    );
  };

  it("write, read, edit and bash work through the env", async () => {
    await run("write", { path: "t/f.txt", content: "alpha\nbeta\n" });
    expect(await readFile(join(workspace, "t/f.txt"), "utf8")).toBe(
      "alpha\nbeta\n",
    );

    const read = await run("read", { path: "t/f.txt" });
    expect(JSON.stringify(read)).toContain("beta");

    await run("edit", {
      path: "t/f.txt",
      edits: [{ oldText: "beta", newText: "gamma" }],
    });
    expect(await readFile(join(workspace, "t/f.txt"), "utf8")).toBe(
      "alpha\ngamma\n",
    );

    chunks.length = 0;
    await run("bash", { command: "cat t/f.txt" });
    expect(chunks.join("")).toContain("gamma");
  });
});
