import { notifications } from "@mantine/notifications";
import { COLORS } from "./colors.ts";
import type { Notice } from "./runner.ts";

/** Shows a notice as a self-closing toast. */
export function toast({ text, level }: Notice) {
  notifications.show({
    message: text,
    color: level === "error" ? COLORS.error : COLORS.info,
    autoClose: level === "error" ? 5000 : 7000,
    styles: { description: { overflowWrap: "anywhere" } },
  });
}
