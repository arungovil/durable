import { connect } from "@durable/client/connection";
import { createHandler } from "@durable/client/messages";
import type { CellMessage, HistoryEntry } from "@durable/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Status } from "../status.ts";

/** What a view needs to draw one session. */
export interface CellSession {
  entries: HistoryEntry[];
  state: Status;
  /** Connected names, including this user. */
  participants: string[];
  /** What the agent is doing ("working..."), or undefined when idle. */
  run: string | undefined;
  /** Latest problem; cleared on reconnect so a new outage reports again. */
  error: string | undefined;
  /** False when the socket is down; the caller keeps the text. */
  send: (text: string) => boolean;
}

const addName = (names: string[], name: string) =>
  names.includes(name) ? names : [...names, name];

/** Keeps a socket to the Cell open while `wsUrl` and `name` are set. */
export function useCell(wsUrl: string | undefined, name: string): CellSession {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [state, setState] = useState<Status>("idle");
  const [participants, setParticipants] = useState<string[]>([]);
  const [run, setRun] = useState<string>();
  const [error, setError] = useState<string>();
  const sendRef = useRef<(text: string) => boolean>(() => false);

  useEffect(() => {
    // New session: the handler's seen-set restarts, so clear the transcript.
    setEntries([]);
    setParticipants([]);
    setRun(undefined);
    setError(undefined);
    if (!wsUrl || !name) {
      setState("idle");
      return;
    }

    const handle = createHandler({
      append: (e) => setEntries((prev) => [...prev, e]),
      // Joins and leaves show in `participants`; only problems need a toast.
      notify: (message, level) => level === "error" && setError(message),
      setRun,
    });
    const onMessage = (m: CellMessage) => {
      if (m.type === "welcome") setParticipants(m.participants);
      else if (m.type === "joined") setParticipants((p) => addName(p, m.name));
      else if (m.type === "left")
        setParticipants((p) => p.filter((n) => n !== m.name));
      handle(m);
    };
    const conn = connect({
      wsUrl,
      name,
      onMessage,
      onState: (s) => {
        setState(s);
        if (s === "connected") setError(undefined);
      },
      onError: setError,
    });
    sendRef.current = (text) =>
      conn.send({ type: "prompt", text, requestId: crypto.randomUUID() });
    return () => {
      sendRef.current = () => false;
      conn.close();
    };
  }, [wsUrl, name]);

  const send = useCallback((text: string) => sendRef.current(text), []);
  return {
    entries,
    state,
    participants,
    run,
    error,
    send,
  };
}
