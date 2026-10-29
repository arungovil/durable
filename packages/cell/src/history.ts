import type { HistoryEntry, TranscriptMessage } from "@durable/protocol";
import type { Message } from "@earendil-works/pi-ai";
import type { EntryRecord } from "@earendil-works/pi-durable";

const isTranscript = (m: Message): m is TranscriptMessage =>
  m.role !== "system";

/** Kind of a stored prompt; its data holds the author. */
export const PROMPT_KIND = "chat.message";

/** `calls` maps tool call ids to arguments, filled as assistant messages pass. */
export function toHistoryEntry(
  e: EntryRecord,
  calls: Map<string, Record<string, unknown>>,
): HistoryEntry | undefined {
  const message = e.model?.at(-1);
  if (!message || !isTranscript(message)) return undefined;
  const entry: HistoryEntry = { id: String(e.id), message };
  if (message.role === "assistant") {
    for (const part of message.content)
      if (part.type === "toolCall") calls.set(part.id, part.arguments);
  } else if (message.role === "toolResult") {
    const args = calls.get(message.toolCallId);
    if (args) entry.args = args;
  } else if (e.kind === PROMPT_KIND) {
    const author = (e.data as { author?: unknown } | undefined)?.author;
    if (typeof author === "string") entry.author = author;
  }
  return entry;
}

/** Entries in order, skipping bookkeeping. Pass `calls` to keep it across calls. */
export function toHistory(
  entries: readonly EntryRecord[],
  calls: Map<string, Record<string, unknown>> = new Map(),
): HistoryEntry[] {
  return entries.flatMap((e) => toHistoryEntry(e, calls) ?? []);
}
