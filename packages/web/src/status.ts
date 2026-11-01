import type { ConnectionState } from "@durable/client/connection";

/** `idle` while there is no Cell to connect to. */
export type Status = ConnectionState | "idle";
