/** Outcome of an operation that can fail in expected ways. `error` is a message for the user. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
