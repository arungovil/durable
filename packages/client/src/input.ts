import type {
  InputEvent,
  InputEventResult,
} from "@earendil-works/pi-coding-agent";
import type { Connection } from "./connection.ts";

/**
 * Sends typed text to the Cell while joined, in place of pi's local agent.
 * Outside a session, extension-made input and slash commands pass through untouched.
 */
export function handleInput(
  event: InputEvent,
  conn: Pick<Connection, "send"> | undefined,
  notify: (message: string, level: "warning") => void,
): InputEventResult {
  if (!conn || event.source === "extension" || event.text.startsWith("/"))
    return { action: "continue" };
  // Consumed either way: falling back to the local agent would answer without the Cell.
  if (event.images?.length)
    notify("images are not sent to the Cell", "warning");
  const sent = conn.send({
    type: "prompt",
    text: event.text,
    requestId: crypto.randomUUID(),
  });
  if (!sent) notify("not connected to the Cell, prompt not sent", "warning");
  return { action: "handled" };
}
