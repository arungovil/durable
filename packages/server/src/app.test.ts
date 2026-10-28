import {
  mkdtemp,
  readFile,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerApi, ServerResult } from "@durable/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";

const TOKEN = "test-token";
let base: string;
let workspace: string;
let outside: string;
let close: () => void;

async function call<K extends keyof ServerApi>(
  route: K,
  req: ServerApi[K]["req"],
): Promise<ServerResult<ServerApi[K]["res"]>> {
  const res = await fetch(base + route, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(req),
  });
  return (await res.json()) as ServerResult<ServerApi[K]["res"]>;
}

const b64 = (s: string) => Buffer.from(s).toString("base64");

beforeAll(async () => {
  workspace = await realpath(await mkdtemp(join(tmpdir(), "ws-")));
  outside = await realpath(await mkdtemp(join(tmpdir(), "out-")));
  await writeFile(join(outside, "secret.txt"), "secret");
  await symlink(outside, join(workspace, "escape"));
  const server = await createApp({ workspace, token: TOKEN });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());

describe("auth", () => {
  it("rejects missing and wrong tokens, but not /health", async () => {
    const body = JSON.stringify({ path: "a" });
    const none = await fetch(`${base}/fs/info`, { method: "POST", body });
    const wrong = await fetch(`${base}/fs/info`, {
      method: "POST",
      body,
      headers: { authorization: "Bearer nope" },
    });
    expect(none.status).toBe(401);
    expect(wrong.status).toBe(401);
    const health = await fetch(`${base}/health`);
    expect(await health.text()).toBe("ok");
  });
});

describe("files", () => {
  it("round-trips write, info and read, including ranges", async () => {
    expect(
      await call("/fs/write", {
        path: "a.txt",
        dataBase64: b64("hello world"),
      }),
    ).toEqual({
      ok: true,
      value: {},
    });
    const info = await call("/fs/info", { path: "a.txt" });
    expect(info).toMatchObject({ ok: true, value: { kind: "file", size: 11 } });
    expect(await call("/fs/read", { path: "a.txt" })).toEqual({
      ok: true,
      value: { dataBase64: b64("hello world") },
    });
    expect(
      await call("/fs/read", { path: "a.txt", offset: 6, length: 5 }),
    ).toEqual({
      ok: true,
      value: { dataBase64: b64("world") },
    });
  });

  it("reports a missing file as not_found", async () => {
    expect(await call("/fs/read", { path: "missing.txt" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("rejects .., absolute paths and symlinks that leave the workspace", async () => {
    const paths = [
      "../x",
      join(outside, "secret.txt"),
      "escape/secret.txt",
      "escape/new.txt",
    ];
    for (const path of paths) {
      expect(await call("/fs/read", { path })).toMatchObject({
        ok: false,
        error: { code: "permission_denied" },
      });
      expect(
        await call("/fs/write", { path, dataBase64: b64("x") }),
      ).toMatchObject({
        ok: false,
        error: { code: "permission_denied" },
      });
    }
    await expect(readFile(join(outside, "new.txt"))).rejects.toThrow();
  });

  it("rejects an exec cwd outside the workspace", async () => {
    expect(
      await call("/exec", { command: "pwd", cwd: "escape" }),
    ).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });
  });
});

describe("exec", () => {
  it("returns output and a nonzero exit code as a result", async () => {
    expect(
      await call("/exec", { command: "echo out; echo err >&2; exit 3" }),
    ).toEqual({
      ok: true,
      value: {
        exitCode: 3,
        stdout: "out\n",
        stderr: "err\n",
        truncated: false,
      },
    });
  });

  it("runs an argv array in the workspace", async () => {
    const r = await call("/exec", { command: ["pwd"] });
    expect(r).toMatchObject({ ok: true, value: { stdout: `${workspace}\n` } });
  });

  it("caps output and sets truncated", async () => {
    const r = await call("/exec", {
      command: ["head", "-c", "2000000", "/dev/zero"],
    });
    expect(r).toMatchObject({ ok: true, value: { truncated: true } });
  });

  it("kills the process on timeout", async () => {
    const pidFile = join(workspace, "pid");
    const r = await call("/exec", {
      command: `echo $$ > pid; exec sleep 30`,
      timeoutMs: 300,
    });
    expect(r).toMatchObject({ ok: false, error: { code: "timeout" } });
    await expectGone(Number((await readFile(pidFile, "utf8")).trim()));
  });

  it("kills the process when the request is aborted", async () => {
    const pidFile = join(workspace, "pid2");
    const ac = new AbortController();
    const pending = fetch(`${base}/exec`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ command: "echo $$ > pid2; exec sleep 30" }),
      signal: ac.signal,
    }).catch(() => undefined);
    await waitFor(() => readFile(pidFile, "utf8").then((s) => s.trim() !== ""));
    ac.abort();
    await pending;
    await expectGone(Number((await readFile(pidFile, "utf8")).trim()));
  });
});

async function waitFor(check: () => Promise<boolean>) {
  for (let i = 0; i < 50; i++) {
    if (await check().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("condition not met");
}

async function expectGone(pid: number) {
  await waitFor(async () => {
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      return true;
    }
  });
}
