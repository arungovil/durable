import type { HistoryEntry } from "@durable/protocol";
import type { Message } from "@earendil-works/pi-ai";
import type { EntryRecord } from "@earendil-works/pi-durable";

function textOf({ content }: Message): string {
  if (typeof content === "string") return content;
  return content
    .map((part) =>
      part.type === "text"
        ? part.text
        : part.type === "toolCall"
          ? `[tool: ${part.name}]`
          : "",
    )
    .filter(Boolean)
    .join("\n");
}

const ROLES: Partial<Record<Message["role"], HistoryEntry["role"]>> = {
  user: "user",
  assistant: "assistant",
  toolResult: "tool",
};

/** Flattens stored entries to what clients show; entries with no model message (bookkeeping) are skipped. */
export function toHistory(entries: readonly EntryRecord[]): HistoryEntry[] {
  return entries.flatMap((e) => {
    const m = e.model?.at(-1);
    const role = m && ROLES[m.role];
    return role ? [{ id: String(e.id), role, text: textOf(m) }] : [];
  });
}
