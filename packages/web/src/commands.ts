export interface CommandInfo {
  name: string;
  /** Argument placeholder; absent if none. */
  arg?: string;
  /** True if the command cannot run without arguments. */
  required?: boolean;
  what: string;
}

const DEFINITIONS = [
  {
    name: "create",
    arg: "[your name]",
    what: "start a new session (your name is remembered)",
  },
  {
    name: "join",
    arg: "<url or id> [your name]",
    required: true,
    what: "join a session",
  },
  { name: "leave", what: "leave the current session" },
] as const satisfies readonly CommandInfo[];

export type CommandName = (typeof DEFINITIONS)[number]["name"];

/** In the order the menu lists them. */
export const COMMANDS: readonly CommandInfo[] = DEFINITIONS;

/** "/join <url or id> [your name]". */
export const usage = (c: CommandInfo) =>
  `/${c.name}${c.arg ? ` ${c.arg}` : ""}`;

/** Usage line per command, e.g. "/join <url or id> [your name]". */
export const USAGE = Object.fromEntries(
  COMMANDS.map((c) => [c.name, usage(c)]),
) as Record<CommandName, string>;

/** "/join abc" gives `{ name: "join", arg: "abc" }`; undefined if not a command. */
export function parseCommand(
  text: string,
): { name: string; arg: string } | undefined {
  const m = /^\/(\S*)\s*(.*)$/s.exec(text);
  return m ? { name: m[1] ?? "", arg: (m[2] ?? "").trim() } : undefined;
}

/**
 * Commands to offer for the text typed so far. Empty past the command name, and for a
 * complete command that can run as typed, so Enter runs it.
 */
export function matchCommands(text: string): CommandInfo[] {
  const m = /^\/(\S*)$/.exec(text);
  if (!m) return [];
  const typed = m[1] ?? "";
  if (COMMANDS.some((c) => c.name === typed && !c.required)) return [];
  return COMMANDS.filter((c) => c.name.startsWith(typed));
}
