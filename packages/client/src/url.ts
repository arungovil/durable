import { CELL_PATH } from "@durable/protocol";
import type { Result } from "./result.ts";

// The local celld dev address; becomes the hosted Cell's URL once there is one.
export const DEFAULT_CELL_URL = "http://127.0.0.1:9876";

/**
 * Returns the WebSocket URL for a Cell, or an error message. Accepts a join URL (http(s) or ws(s))
 * or a bare id, which is joined on `DEFAULT_CELL_URL`.
 */
export function parseCellUrl(input: string): Result<string> {
  let u: URL;
  try {
    u = new URL(
      CELL_PATH.test(`/cell/${input}`)
        ? `${DEFAULT_CELL_URL}/cell/${input}`
        : input,
    );
  } catch {
    return { ok: false, error: "not a Cell id or join URL" };
  }
  if (!["http:", "https:", "ws:", "wss:"].includes(u.protocol))
    return { ok: false, error: `unsupported scheme ${u.protocol}` };
  if (!u.host) return { ok: false, error: "missing host" };
  if (!CELL_PATH.test(u.pathname))
    return { ok: false, error: "path must be /cell/<uuid>" };
  u.protocol = u.protocol.replace(/^http/, "ws");
  return { ok: true, value: u.toString() };
}
