import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { createCell } from "../src/create.ts";

let server: Server | undefined;
afterEach(() => server?.close());

/** Starts a Cell stand-in that answers every request with `status` and `body`. */
async function cell(status: number, body: string): Promise<string> {
  server = createServer((_req, res) => res.writeHead(status).end(body));
  await new Promise<void>((r) => server?.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

it("returns the new id", async () => {
  expect(await createCell(await cell(200, '{"id":"abc"}'))).toEqual({
    ok: true,
    value: "abc",
  });
});

it.each([
  [404, "", "answered HTTP 404"],
  [200, "<html>", "unexpected reply"],
  [200, "{}", "unexpected reply"],
])("explains a bad reply (%i %j)", async (status, body, message) => {
  const r = await createCell(await cell(status, body));
  expect(r).toMatchObject({ ok: false });
  expect(!r.ok && r.error).toContain(message);
});

it("says the Cell is unreachable when nothing listens", async () => {
  const base = await cell(200, "");
  server?.close();
  const r = await createCell(base);
  expect(!r.ok && r.error).toContain("cannot reach");
});

it.each(["localhost:9876", "nonsense", "ftp://h"])(
  "rejects %s before any request",
  async (base) => {
    const r = await createCell(base);
    expect(!r.ok && r.error).toContain("not an http(s) URL");
  },
);
