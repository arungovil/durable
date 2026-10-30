import { userInfo } from "node:os";
import type { HistoryEntry } from "@durable/protocol";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type Connection, connect } from "./connection.ts";
import { createCell } from "./create.ts";
import { handleInput } from "./input.ts";
import { createHandler, ENTRY_TYPE } from "./messages.ts";
import { renderEntry } from "./render.ts";
import { DEFAULT_CELL_URL, parseCellUrl } from "./url.ts";

const SUBCOMMANDS = ["create", "join", "leave"];

const RUN_STATUS = "durable-run";

export default function (pi: ExtensionAPI) {
  let current: Connection | undefined;

  // Entries are shown but, unlike messages, not sent to the local model.
  pi.registerEntryRenderer<HistoryEntry>(ENTRY_TYPE, (entry, { expanded }) =>
    entry.data ? renderEntry(entry.data, expanded) : undefined,
  );

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
        const cell = new URL(parsed.value);
        current?.close();
        ctx.ui.setStatus(RUN_STATUS, undefined);
        current = connect({
          wsUrl: parsed.value,
          name: user,
          onState: (s) =>
            ctx.ui.setStatus(
              "durable",
              `durable: ${s} · ${cell.pathname.slice(-8)} · ${user}`,
            ),
          onError: (message) => ctx.ui.notify(message, "warning"),
          onMessage: createHandler({
            append: (entry) => pi.appendEntry(ENTRY_TYPE, entry),
            notify: (message, level) => ctx.ui.notify(message, level),
            setRun: (text) => ctx.ui.setStatus(RUN_STATUS, text),
          }),
        });
        ctx.ui.notify(
          `Joined as ${user}. Invite: /durable join ${url}`,
          "info",
        );
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
        ctx.ui.setStatus(RUN_STATUS, undefined);
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
        return join(invite);
      }
      ctx.ui.notify(
        "usage: /durable create [base-url] | join <id|url> | leave",
        "info",
      );
    },
  });
}
