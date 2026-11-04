import { createCell } from "@durable/client/create";
import { DEFAULT_CELL_URL, parseCellUrl } from "@durable/client/url";
import { NAME } from "@durable/protocol";
import { parseCommand, USAGE } from "./commands.ts";

/** Feedback shown as a toast. */
export interface Notice {
  text: string;
  level: "info" | "error";
}

interface Context {
  name: string;
  cellId: string;
  setName: (name: string) => void;
  setCellId: (id: string) => void;
  /** False when the socket is down. */
  send: (text: string) => boolean;
  notify: (notice: Notice) => void;
}

/**
 * Handles one line from the chat input: runs a command, or sends text to the Cell.
 * Resolves true when handled (the input clears), false when the user should fix it.
 */
export async function runLine(ctx: Context, line: string): Promise<boolean> {
  const { name, cellId, setName, setCellId, send, notify } = ctx;
  const fail = (text: string) => {
    notify({ text, level: "error" });
    return false;
  };
  const ok = (text?: string) => {
    if (text) notify({ text, level: "info" });
    return true;
  };

  const cmd = parseCommand(line);
  if (!cmd) {
    if (!cellId)
      return fail(
        "You haven't joined a session yet. Type / to create or join one.",
      );
    if (!send(line))
      return fail("Not connected to the session, message not sent.");
    return ok();
  }
  // The given name, else the remembered one.
  const resolveName = (given: string | undefined, command: string) => {
    const who = given || name;
    if (!who) fail(`Enter your name to continue: ${command}`);
    else if (!NAME.test(who))
      fail("Your name must be 1-32 characters, with no spaces or brackets.");
    else return who;
  };
  switch (cmd.name) {
    case "create": {
      const who = resolveName(cmd.arg, USAGE.create);
      if (!who) return false;
      const r = await createCell(DEFAULT_CELL_URL);
      if (!r.ok) return fail(r.error);
      setName(who);
      setCellId(r.value);
      return ok(
        `Created session ${r.value}. Others join with /join ${r.value}`,
      );
    }
    case "join": {
      const [target = "", given, ...extra] = cmd.arg.split(/\s+/);
      if (extra.length > 0) return fail(`Usage: ${USAGE.join}`);
      const r = parseCellUrl(target);
      if (!r.ok) return fail(r.error);
      const who = resolveName(given, USAGE.join);
      if (!who) return false;
      setName(who);
      // The full URL, so a Cell on another host stays reachable.
      setCellId(r.value);
      return ok();
    }
    case "leave":
      if (!cellId) return fail("You haven't joined a session yet.");
      setCellId("");
      return ok("Left the session.");
    default:
      return fail(`Unknown command /${cmd.name}. Type / to see commands.`);
  }
}
