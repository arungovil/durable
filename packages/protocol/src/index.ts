import type { Message } from "@earendil-works/pi-ai";

// Wire types shared by all three layers. Client <-> Cell is WebSocket; Cell -> Server is HTTP.

/** Client -> Cell. */
export type ClientMessage =
  | { type: "hello"; name: string }
  | { type: "prompt"; text: string; requestId: string };

/** The roles clients draw; the system message is never sent. */
export type TranscriptMessage = Extract<
  Message,
  { role: "user" | "assistant" | "toolResult" }
>;

/** One finished transcript item. Bookkeeping entries are never sent. */
export interface HistoryEntry {
  id: string;
  message: TranscriptMessage;
  author?: string;
  /** Tool results only: arguments of the call it answers, absent if that call is unknown. */
  args?: Record<string, unknown>;
}

/** One live change, sent to every greeted client. Finished items only: no token streaming. */
export type CellEvent =
  /** Clients skip ids they already have; `history` may have sent it too. */
  | { type: "entry"; entry: HistoryEntry }
  /** A tool call began; its result follows as an `entry`. */
  | {
      type: "tool_start";
      id: string;
      name: string;
      args: Record<string, unknown>;
    }
  | { type: "run_start" }
  | { type: "run_end" }
  /** A run failed, e.g. `model_error: ...`. */
  | { type: "error"; message: string };

/** Cell -> Client. `event` gets its real shape in step 7. */
export type CellMessage =
  | { type: "welcome"; participants: string[] }
  | { type: "history"; entries: HistoryEntry[] }
  | { type: "event"; event: unknown }
  | { type: "joined" | "left"; name: string }
  | { type: "error"; message: string };

/** Path of a Cell's WebSocket: `/cell/<id>`, where the id is a lowercase v4 UUID. */
export const CELL_PATH =
  /^\/cell\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Response of `POST /new` on the Cell base URL; the join URL is `<base>/cell/<id>`. */
export interface NewCellResponse {
  /** Random v4 UUID, lowercase; unguessable. */
  id: string;
}

/** Same codes as pi-durable's FileErrorCode and ExecutionErrorCode, so the Cell adapter maps them one to one. */
export type ErrorCode =
  | "aborted"
  | "not_found"
  | "permission_denied"
  | "not_directory"
  | "is_directory"
  | "invalid"
  | "not_supported"
  | "timeout"
  | "shell_unavailable"
  | "spawn_error"
  | "unknown";

export interface ServerError {
  code: ErrorCode;
  message: string;
  path?: string;
}

/** Outcome of an operation that can fail in expected ways. A string `error` is a message for the user. */
export type Result<T, E = string> =
  { ok: true; value: T } | { ok: false; error: E };

/** Every Server route answers 200 with this, except auth failures (401). */
export type ServerResult<T> = Result<T, ServerError>;

export interface FileInfo {
  name: string;
  path: string;
  kind: "file" | "directory" | "symlink";
  size: number;
  mtimeMs: number;
}

export interface ExecRequest {
  /** A string runs through the shell; an array runs command[0] directly. */
  command: string | string[];
  cwd?: string;
  timeoutMs?: number;
}

export interface ExecResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Output was cut at the Server's size limit. */
  truncated: boolean;
}

/** Cell -> Server, POST with a JSON body: route -> request and response types. */
export interface ServerApi {
  // shortcut: file bytes travel as base64 in JSON, upgrade if large files matter
  "/fs/read": {
    req: { path: string; offset?: number; length?: number };
    res: { dataBase64: string };
  };
  "/fs/write": {
    req: { path: string; dataBase64: string };
    res: Record<string, never>;
  };
  "/fs/info": { req: { path: string }; res: FileInfo };
  "/exec": { req: ExecRequest; res: ExecResponse };
}
