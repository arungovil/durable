import type { ErrorCode, ServerError, ServerResult } from "@durable/protocol";
import type { Result } from "@earendil-works/pi-durable/env";
/** Builds an error result; `path` is left out of the error entirely when undefined, not set to `undefined`. */
export const fail = (
  code: ErrorCode,
  message: string,
  path?: string,
): { ok: false; error: ServerError } => ({
  ok: false,
  error: path === undefined ? { code, message } : { code, message, path },
});

/** pi-durable's `callback_error` has no wire code; it maps to `unknown`. */
export function fromResult<T>(
  r: Result<T, { code: string; message: string; path?: string }>,
): ServerResult<T> {
  if (r.ok) return r;
  const code = r.error.code === "callback_error" ? "unknown" : r.error.code;
  return fail(code as ErrorCode, r.error.message, r.error.path);
}
