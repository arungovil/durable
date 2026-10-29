import type { NewCellResponse, Result } from "@durable/protocol";

const TIMEOUT_MS = 10_000;

/** Asks the Cell at `base` for a new session and returns its id. Expected failures are returned, not thrown. */
export async function createCell(base: string): Promise<Result<string>> {
  const fail = (error: string): Result<string> => ({ ok: false, error });
  if (!/^https?:/.test(base) || !URL.canParse(base))
    return fail(`${base} is not an http(s) URL`);
  try {
    const res = await fetch(`${base}/new`, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return fail(`${base} answered HTTP ${res.status}`);
    const { id } = (await res.json()) as Partial<NewCellResponse>;
    return id
      ? { ok: true, value: id }
      : fail(`${base} sent an unexpected reply`);
  } catch (e) {
    // fetch rejects with a bare TypeError("fetch failed") when nothing answers.
    if (e instanceof DOMException && e.name === "TimeoutError")
      return fail(`no answer from ${base} after ${TIMEOUT_MS / 1000}s`);
    if (e instanceof TypeError)
      return fail(`cannot reach ${base} (is the Cell running?)`);
    if (e instanceof SyntaxError)
      return fail(`${base} sent an unexpected reply`);
    return fail(e instanceof Error ? e.message : String(e));
  }
}
