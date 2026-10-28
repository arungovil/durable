import type { ExecResponse } from "@durable/protocol";
import type { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { confine } from "../confine.ts";
import { fromResult } from "../result.ts";
import { ctxFor, type Handler } from "./handler.ts";

/** Per stream; output beyond this is dropped and `truncated` is set. */
const MAX_OUTPUT_BYTES = 1024 * 1024;

export function execHandler(
  root: string,
  env: NodeExecutionEnv,
): Handler<"/exec"> {
  return async (req, signal) => {
    const cwd = await confine(root, req.cwd ?? ".");
    if (!cwd.ok) return cwd;
    let stdout = "";
    let stderr = "";
    let truncated = false;
    const add = (cur: string, text: string) => {
      const room = MAX_OUTPUT_BYTES - Buffer.byteLength(cur);
      if (text.length > room) truncated = true;
      return cur + text.slice(0, Math.max(room, 0));
    };
    const r = await env.exec(
      req.command,
      {
        cwd: cwd.value,
        timeout: req.timeoutMs === undefined ? undefined : req.timeoutMs / 1000,
        onOutput: (text, _ctx, { stream }) => {
          if (stream === "stdout") stdout = add(stdout, text);
          else stderr = add(stderr, text);
        },
      },
      ctxFor(signal),
    );
    if (!r.ok) return fromResult(r);
    const value: ExecResponse = {
      exitCode: r.value.exitCode,
      stdout,
      stderr,
      truncated,
    };
    return { ok: true, value };
  };
}
