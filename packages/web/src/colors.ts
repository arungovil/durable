import type { Status } from "./status.ts";

/** Every UI color, so a change is made once. */
export const COLORS = {
  muted: "dimmed",
  error: "red",
  info: "blue",
  status: {
    idle: "gray",
    connecting: "yellow",
    connected: "green",
    reconnecting: "orange",
  } satisfies Record<Status, string>,
  avatar: "initials",
  menuActive: "var(--mantine-color-default-hover)",
} as const;

/** CSS variable for a Mantine color's solid shade. */
export const filled = (color: string) => `var(--mantine-color-${color}-filled)`;
