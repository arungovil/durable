import type { CellMessage, HistoryEntry } from "@durable/protocol";

/** `customType` of the transcript entries the extension adds; their data is a `HistoryEntry`. */
export const ENTRY_TYPE = "durable-entry";

export interface Sink {
  append: (entry: HistoryEntry) => void;
  notify: (message: string, level: "info" | "error") => void;
  /** The live status line; `undefined` clears it. */
  setRun: (text: string | undefined) => void;
}

/** Turns Cell messages into entries and status. One per session: it remembers what it showed. */
export function createHandler(sink: Sink): (m: CellMessage) => void {
  const seen = new Set<string>();
  // An entry can arrive in history and live, and a reconnect resends history.
  const show = (e: HistoryEntry) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    sink.append(e);
  };
  return (m) => {
    switch (m.type) {
      case "history":
        return m.entries.forEach(show);
      case "error":
        return sink.notify(m.message, "error");
      case "welcome":
        if (m.participants.length < 2) return;
        return sink.notify(`In session: ${m.participants.join(", ")}`, "info");
      case "joined":
      case "left":
        return sink.notify(`${m.name} ${m.type}`, "info");
      case "event": {
        const { event } = m;
        switch (event.type) {
          case "entry":
            show(event.entry);
            if (event.entry.message.role === "toolResult")
              sink.setRun("working...");
            return;
          case "tool_start":
            return sink.setRun(`running ${event.name}...`);
          case "run_start":
            return sink.setRun("working...");
          case "run_end":
            return sink.setRun(undefined);
          case "error":
            sink.setRun(undefined);
            return sink.notify(event.message, "error");
        }
      }
    }
  };
}
