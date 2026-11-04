import {
  BACKGROUND_CONTEXT,
  type Context,
  withAbortSignal,
} from "@earendil-works/chord/context";
import type { ServerApi, ServerResult } from "@pairable/protocol";

export type Handler<K extends keyof ServerApi> = (
  req: ServerApi[K]["req"],
  signal: AbortSignal,
) => Promise<ServerResult<ServerApi[K]["res"]>>;

export const ctxFor = (signal: AbortSignal): Context =>
  withAbortSignal(signal, BACKGROUND_CONTEXT);
