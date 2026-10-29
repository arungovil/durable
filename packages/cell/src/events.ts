import type { CellEvent } from "@durable/protocol";
import type { AgentEvent } from "@earendil-works/pi-durable";
import { toHistoryEntry } from "./history.ts";

/** Tool call id -> arguments, so a result can carry the call it answers. */
export type Calls = Map<string, Record<string, unknown>>;

/**
 * Maps a batch of agent events to what clients see; the rest are dropped.
 * A `snapshot` maps to nothing: the caller resends history when it sees one.
 */
export function toCellEvents(
  events: readonly AgentEvent[],
  calls: Calls,
): CellEvent[] {
  return events.flatMap((e): CellEvent[] => {
    switch (e.type) {
      case "message_end": {
        const entry = toHistoryEntry(e.entry, calls);
        return entry ? [{ type: "entry", entry }] : [];
      }
      case "tool_execution_start":
        return [
          {
            type: "tool_start",
            id: e.toolCallId,
            name: e.toolName,
            args: e.args,
          },
        ];
      case "run_start":
        return [{ type: "run_start" }];
      case "run_end":
        calls.clear();
        return [{ type: "run_end" }];
      case "submission":
        return e.record.status === "unanswered"
          ? [{ type: "error", message: unanswered(e.record) }]
          : [];
      case "task_failed":
        return [{ type: "error", message: `${e.kind} failed: ${e.message}` }];
      default:
        return [];
    }
  });
}

function unanswered(r: { reason?: string; detail?: unknown }): string {
  const reason = r.reason ?? "unanswered";
  if (r.detail === undefined || r.detail === null) return reason;
  const detail =
    typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail);
  return `${reason}: ${detail}`;
}
