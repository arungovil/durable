// Wire types shared by all three layers. Client <-> Cell is WebSocket; Cell -> Server is HTTP.

/** Client -> Cell. */
export type ClientMessage =
  | { type: "hello"; name: string }
  | { type: "prompt"; text: string; requestId: string };

/** Cell -> Client. */
export type CellMessage =
  | { type: "welcome"; participants: string[] }
  | { type: "joined" | "left"; name: string }
  | { type: "error"; message: string };

/** Cell -> Server: run a tool against the shared workspace. */
export interface ToolRunRequest {
  tool: string;
  args: Record<string, unknown>;
}
