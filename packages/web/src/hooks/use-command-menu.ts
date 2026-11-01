import { type KeyboardEvent, useState } from "react";
import { type CommandInfo, matchCommands } from "../commands.ts";

/** Text left in the input after choosing; a trailing space invites the argument. */
const complete = (c: CommandInfo) => `/${c.name}${c.arg ? " " : ""}`;

/** State and keys for the menu that opens while typing `/command`. */
export function useCommandMenu(text: string, setText: (text: string) => void) {
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const matches = matchCommands(text);
  const open = matches.length > 0 && !dismissed;
  // The list shrinks as the user types, so the index can overshoot.
  const index = Math.min(active, matches.length - 1);

  const reset = () => {
    setActive(0);
    setDismissed(false);
  };
  const select = (c: CommandInfo) => {
    setText(complete(c));
    reset();
  };

  /** True when the menu used the key, so it must not also submit. */
  const onKeyDown = (e: KeyboardEvent): boolean => {
    const target = matches[index];
    if (!open || !target) return false;
    switch (e.key) {
      case "ArrowDown":
        setActive((index + 1) % matches.length);
        break;
      case "ArrowUp":
        setActive((index - 1 + matches.length) % matches.length);
        break;
      case "Tab":
      case "Enter":
        select(target);
        break;
      case "Escape":
        setDismissed(true);
        break;
      default:
        return false;
    }
    e.preventDefault();
    return true;
  };

  return { matches, open, index, setActive, select, reset, onKeyDown };
}
