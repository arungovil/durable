import { userInfo } from "node:os";
import type { CellMessage, HistoryEntry } from "@durable/protocol";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type Connection, connect } from "./connection.ts";
import { createCell } from "./create.ts";
import { handleInput } from "./input.ts";
import { DEFAULT_CELL_URL, parseCellUrl } from "./url.ts";

const SUBCOMMANDS = ["create", "join", "leave"];

const render = (e: HistoryEntry) => `${e.role}: ${e.text}`;

// Layer 1: pi extension. Connects the local pi session to a Cell over WebSocket.
export default function (pi: ExtensionAPI) {
  let current: Connection | undefined;

  pi.on("input", (event, ctx) =>
    handleInput(event, current, (message, level) =>
      ctx.ui.notify(message, level),
    ),
  );

  pi.registerCommand("durable", {
    description:
      "Shared Cell: /durable create [base-url] | /durable join <id|url> [name] | /durable leave",
    getArgumentCompletions: (prefix) => {
      if (prefix.includes(" ")) return null;
      const items = SUBCOMMANDS.filter((s) => s.startsWith(prefix)).map(
        (s) => ({ value: s, label: s }),
      );
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      const [sub, arg, name] = args.trim().split(/\s+/);
      const user = name || userInfo().username;

      const fail = (command: string, error: string) =>
        ctx.ui.notify(`${command}: ${error}`, "error");

      const join = (url: string) => {
        const parsed = parseCellUrl(url);
        if (!parsed.ok) return fail("join", parsed.error);
        current?.close();
        const seen = new Set<string>();
        current = connect({
          wsUrl: parsed.value,
          name: user,
          onState: (s) => ctx.ui.setStatus("durable", `cell: ${s}`),
          onError: (message) => ctx.ui.notify(message, "warning"),
          onMessage: (m: CellMessage) => {
            if (m.type === "error") ctx.ui.notify(m.message, "error");
            else if (m.type === "history") {
              // A reconnect resends everything; show only what is new.
              const fresh = m.entries.filter((e) => !seen.has(e.id));
              for (const e of fresh) seen.add(e.id);
              if (fresh.length)
                pi.sendMessage({
                  customType: "durable-history",
                  content: fresh.map(render).join("\n\n"),
                  display: true,
                });
            }
          },
        });
      };

      if (sub === "join") {
        if (!arg)
          return fail(
            "join",
            "pass the id or URL that /durable create printed",
          );
        return join(arg);
      }
      if (sub === "leave") {
        if (!current)
          return ctx.ui.notify("leave: not in a session", "warning");
        current.close();
        current = undefined;
        ctx.ui.setStatus("durable", undefined);
        return ctx.ui.notify("Left the session", "info");
      }
      if (sub === "create") {
        const base = (
          arg ||
          process.env.DURABLE_CELL_URL ||
          DEFAULT_CELL_URL
        ).replace(/\/$/, "");
        const created = await createCell(base);
        if (!created.ok) return fail("create", created.error);
        // The id alone is enough to join on the default Cell.
        const invite =
          base === DEFAULT_CELL_URL
            ? created.value
            : `${base}/cell/${created.value}`;
        ctx.ui.notify(`Join with: /durable join ${invite}`, "info");
        return join(invite);
      }
      ctx.ui.notify(
        "usage: /durable create [base-url] | join <id|url> | leave",
        "info",
      );
    },
  });
}
