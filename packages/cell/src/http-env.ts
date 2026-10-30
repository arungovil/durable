import type {
  ErrorCode,
  ExecRequest,
  ServerApi,
  ServerError,
  ServerResult,
} from "@durable/protocol";
import type { Context } from "@earendil-works/chord/context";
import {
  type BinaryReader,
  type ExecutionEnv,
  ExecutionError,
  type ExecutionErrorCode,
  FileError,
  type FileErrorCode,
  type FileInfo,
  type LineScan,
  LineScanner,
  ok,
  type Result,
  type ShellExecOptions,
  type ShellExecResult,
} from "@earendil-works/pi-durable/env";

export interface HttpExecutionEnvOptions {
  /** Base URL of the Server, no trailing slash. Doubles as the file namespace `id`. */
  url: string;
  token: string;
  /** Absolute path of the workspace on the Server; relative tool paths resolve against it. */
  cwd: string;
}

const FILE_CODES: readonly ErrorCode[] = [
  "aborted",
  "not_found",
  "permission_denied",
  "not_directory",
  "is_directory",
  "invalid",
  "not_supported",
];
const EXEC_CODES: readonly ErrorCode[] = [
  "aborted",
  "timeout",
  "shell_unavailable",
  "spawn_error",
];

const SCAN_CHUNK = 256 * 1024;

const fileError = (e: ServerError) =>
  new FileError(
    FILE_CODES.includes(e.code) ? (e.code as FileErrorCode) : "unknown",
    e.message,
    e.path,
  );

const execError = (e: ServerError) =>
  new ExecutionError(
    EXEC_CODES.includes(e.code) ? (e.code as ExecutionErrorCode) : "unknown",
    e.message,
  );

const unsupported = (what: string) =>
  ({
    ok: false,
    error: new FileError("not_supported", `${what} is not supported`),
  }) as const;

const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const fromBase64 = (b64: string) =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Lexical POSIX resolve; the Server does the real confinement and symlink handling. */
function resolvePath(cwd: string, path: string): string {
  const out: string[] = [];
  const full = path.startsWith("/") ? path : `${cwd}/${path}`;
  for (const part of full.split("/")) {
    if (part === "..") out.pop();
    else if (part !== "" && part !== ".") out.push(part);
  }
  return `/${out.join("/")}`;
}

/**
 * `ExecutionEnv` that forwards to the Server over HTTP, so pi-durable's built-in tools run against the Server's files.
 * Implements what `read`, `write`, `edit` and `bash` reach; every other method fails with `not_supported`.
 * shortcut: `exec` is buffered (no live output) and ignores `env`, `inheritEnv`, `spill` and `window`; upgrade with
 * streaming exec when long commands need live output.
 */
export class HttpExecutionEnv implements ExecutionEnv {
  readonly id: string;
  cwd: string;
  readonly #url: string;
  readonly #token: string;

  constructor(options: HttpExecutionEnvOptions) {
    this.id = options.url;
    this.cwd = options.cwd;
    this.#url = options.url;
    this.#token = options.token;
  }

  /** Transport failures and non-JSON replies become `unknown` errors; an aborted signal becomes `aborted`. */
  async #call<K extends keyof ServerApi>(
    route: K,
    req: ServerApi[K]["req"],
    context: Context,
  ): Promise<ServerResult<ServerApi[K]["res"]>> {
    const fail = (code: ErrorCode, message: string): ServerResult<never> => ({
      ok: false,
      error: { code, message },
    });
    try {
      const res = await fetch(this.#url + route, {
        method: "POST",
        headers: { authorization: `Bearer ${this.#token}` },
        body: JSON.stringify(req),
        signal: context.abortSignal,
      });
      if (!res.ok) return fail("unknown", `server returned ${res.status}`);
      return (await res.json()) as ServerResult<ServerApi[K]["res"]>;
    } catch (e) {
      if (context.abortSignal?.aborted) return fail("aborted", "aborted");
      return fail("unknown", e instanceof Error ? e.message : String(e));
    }
  }

  async #read(
    path: string,
    range: { offset?: number; length?: number },
    context: Context,
  ): Promise<Result<Uint8Array, FileError>> {
    const r = await this.#call("/fs/read", { path, ...range }, context);
    return r.ok
      ? ok(fromBase64(r.value.dataBase64))
      : { ok: false, error: fileError(r.error) };
  }

  async absolutePath(path: string, _context: Context) {
    return ok<string, FileError>(resolvePath(this.cwd, path));
  }

  async joinPath(parts: string[], _context: Context) {
    return ok<string, FileError>(resolvePath("/", parts.join("/")));
  }

  // Not supported: the mutation queue then keys on the absolute path, which is enough for one Server.
  async canonicalPath(_path: string, _context: Context) {
    return unsupported("canonicalPath");
  }

  async fileInfo(
    path: string,
    context: Context,
  ): Promise<Result<FileInfo, FileError>> {
    const r = await this.#call("/fs/info", { path }, context);
    return r.ok ? ok(r.value) : { ok: false, error: fileError(r.error) };
  }

  async exists(path: string, context: Context) {
    const r = await this.fileInfo(path, context);
    if (r.ok) return ok<boolean, FileError>(true);
    return r.error.code === "not_found" ? ok<boolean, FileError>(false) : r;
  }

  async readBinaryFile(path: string, context: Context) {
    return this.#read(path, {}, context);
  }

  async readTextFile(
    path: string,
    context: Context,
  ): Promise<Result<string, FileError>> {
    const r = await this.#read(path, {}, context);
    return r.ok ? ok(new TextDecoder().decode(r.value)) : r;
  }

  async openBinaryReader(
    path: string,
    _options: { noFollow?: boolean } | undefined,
    context: Context,
  ): Promise<Result<BinaryReader, FileError>> {
    const first = await this.fileInfo(path, context);
    if (!first.ok) return first;
    if (first.value.kind === "directory")
      return {
        ok: false,
        error: new FileError("is_directory", "is a directory", path),
      };
    // shortcut: no file handle on the Server, so a rename between calls is followed, and `noFollow` is ignored;
    // upgrade with a Server-side open/handle route if that matters.
    const read = (offset: number, length: number, c: Context) =>
      this.#read(path, { offset, length }, c);
    return ok({
      info: (c) => this.fileInfo(path, c),
      read,
      async scanLines(options, c) {
        let scanner: LineScanner;
        try {
          scanner = new LineScanner(options.startLine, options.endLine);
        } catch {
          return {
            ok: false,
            error: new FileError("invalid", "Invalid line range", path),
          };
        }
        for (let offset = 0; ; offset += SCAN_CHUNK) {
          const chunk = await read(offset, SCAN_CHUNK, c);
          if (!chunk.ok) return chunk;
          if (chunk.value.length === 0)
            return ok<LineScan, FileError>(scanner.finish());
          scanner.push(chunk.value);
        }
      },
      async close() {},
    });
  }

  async writeFile(
    path: string,
    content: string | Uint8Array,
    context: Context,
  ): Promise<Result<void, FileError>> {
    const bytes =
      typeof content === "string" ? new TextEncoder().encode(content) : content;
    const r = await this.#call(
      "/fs/write",
      { path, dataBase64: toBase64(bytes) },
      context,
    );
    return r.ok ? ok(undefined) : { ok: false, error: fileError(r.error) };
  }

  async exec(
    command: string | readonly string[],
    options: ShellExecOptions | undefined,
    context: Context,
  ): Promise<Result<ShellExecResult, ExecutionError>> {
    const req: ExecRequest = {
      command: typeof command === "string" ? command : [...command],
      ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options?.timeout === undefined
        ? {}
        : { timeoutMs: options.timeout * 1000 }),
    };
    const r = await this.#call("/exec", req, context);
    if (!r.ok) return { ok: false, error: execError(r.error) };
    // Stdout and stderr arrive separately, so their interleaving is lost.
    if (r.value.stdout)
      options?.onOutput?.(r.value.stdout, context, { stream: "stdout" });
    if (r.value.stderr)
      options?.onOutput?.(r.value.stderr, context, { stream: "stderr" });
    return ok({ exitCode: r.value.exitCode });
  }

  async cleanup(_context: Context) {}

  // ── Unsupported ──
  // The Server has no routes for these; none is reached by `read`, `write`, `edit` or `bash`.
  async openTextLineReader(_path: string, _context: Context) {
    return unsupported("openTextLineReader");
  }
  async readTextLines(_path: string, _o: unknown, _context: Context) {
    return unsupported("readTextLines");
  }
  async appendFile(_path: string, _c: string | Uint8Array, _x: Context) {
    return unsupported("appendFile");
  }
  async truncateFile(_path: string, _size: number, _context: Context) {
    return unsupported("truncateFile");
  }
  async flushFile(_path: string, _context: Context) {
    return unsupported("flushFile");
  }
  async renameFile(_from: string, _to: string, _context: Context) {
    return unsupported("renameFile");
  }
  async listDir(_path: string, _context: Context) {
    return unsupported("listDir");
  }
  async openDirReader(_path: string, _context: Context) {
    return unsupported("openDirReader");
  }
  async watch(_targets: unknown, _onChange: unknown, _context: Context) {
    return unsupported("watch");
  }
  async createDir(_path: string, _o: unknown, _context: Context) {
    return unsupported("createDir");
  }
  async remove(_path: string, _o: unknown, _context: Context) {
    return unsupported("remove");
  }
  async createTempDir(_prefix: string | undefined, _context: Context) {
    return unsupported("createTempDir");
  }
  async createTempFile(_o: unknown, _context: Context) {
    return unsupported("createTempFile");
  }
}
