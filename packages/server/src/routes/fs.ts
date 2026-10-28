import type { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { confine } from "../confine.ts";
import { fromResult } from "../result.ts";
import { ctxFor, type Handler } from "./handler.ts";

export function fsHandlers(root: string, env: NodeExecutionEnv) {
  const read: Handler<"/fs/read"> = async (req, signal) => {
    const p = await confine(root, req.path);
    if (!p.ok) return p;
    const ctx = ctxFor(signal);
    const reader = await env.openBinaryReader(p.value, undefined, ctx);
    if (!reader.ok) return fromResult(reader);
    try {
      const info = await reader.value.info(ctx);
      if (!info.ok) return fromResult(info);
      const offset = req.offset ?? 0;
      const length = req.length ?? Math.max(info.value.size - offset, 0);
      const data = await reader.value.read(offset, length, ctx);
      if (!data.ok) return fromResult(data);
      return {
        ok: true,
        value: { dataBase64: Buffer.from(data.value).toString("base64") },
      };
    } finally {
      await reader.value.close(ctx);
    }
  };

  const write: Handler<"/fs/write"> = async (req, signal) => {
    const p = await confine(root, req.path);
    if (!p.ok) return p;
    const r = await env.writeFile(
      p.value,
      Buffer.from(req.dataBase64, "base64"),
      ctxFor(signal),
    );
    return r.ok ? { ok: true, value: {} } : fromResult(r);
  };

  const info: Handler<"/fs/info"> = async (req, signal) => {
    const p = await confine(root, req.path);
    if (!p.ok) return p;
    return fromResult(await env.fileInfo(p.value, ctxFor(signal)));
  };

  return { "/fs/read": read, "/fs/write": write, "/fs/info": info };
}
