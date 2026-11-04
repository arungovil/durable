import type { ConnectionState } from "@pairable/client/connection";

/** `idle` while there is no Cell to connect to. */
export type Status = ConnectionState | "idle";
