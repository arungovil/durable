// Wire types shared by all three layers. Client <-> Cell is WebSocket; Cell -> Server is HTTP.

/** Client -> Cell. */
export type ClientMessage =
  | { type: "hello"; name: string }
  | { type: "prompt"; text: string; requestId: string };

/** Cell -> Client. `entries` and `event` get their real shapes in steps 5 and 7. */
export type CellMessage =
  | { type: "welcome"; participants: string[] }
  | { type: "history"; entries: unknown[] }
  | { type: "event"; event: unknown }
  | { type: "joined" | "left"; name: string }
  | { type: "error"; message: string };

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

/** Every Server route answers 200 with this, except auth failures (401). */
export type ServerResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ServerError };

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
