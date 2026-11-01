import { parseCellUrl } from "@durable/client/url";
import { Flex } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useEffect } from "react";
import { CellHeader } from "./cell/cell-header.tsx";
import { ChatInput } from "./cell/chat-input.tsx";
import { Help } from "./cell/help.tsx";
import { MessageList } from "./cell/message-list.tsx";
import { useCell } from "./hooks/use-cell.ts";
import { runLine } from "./runner.ts";
import { toast } from "./toast.ts";

const PLACEHOLDER = {
  idle: "Type / to create or join a session",
  connected: "Message the session",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
};

export function App() {
  const [name, setName] = useLocalStorage({
    key: "durable.name",
    defaultValue: "",
    getInitialValueInEffect: false,
  });
  const [cellId, setCellId] = useLocalStorage({
    key: "durable.cell",
    defaultValue: "",
    getInitialValueInEffect: false,
  });

  // An id that no longer parses counts as no cell.
  const ws = cellId ? parseCellUrl(cellId) : undefined;
  const wsUrl = ws?.ok ? ws.value : undefined;
  const cell = useCell(wsUrl, name);

  const ctx = {
    name,
    cellId: wsUrl ? cellId : "",
    setName,
    setCellId,
    send: cell.send,
    notify: toast,
  };

  useEffect(() => {
    if (cell.error) toast({ text: cell.error, level: "error" });
  }, [cell.error]);

  return (
    <Flex direction="column" h="100dvh">
      <CellHeader
        id={wsUrl ? cellId : ""}
        name={name}
        state={cell.state}
        participants={cell.participants}
      />
      {wsUrl ? <MessageList entries={cell.entries} run={cell.run} /> : <Help />}
      <ChatInput
        onSubmit={(line) => runLine(ctx, line)}
        placeholder={PLACEHOLDER[cell.state]}
      />
    </Flex>
  );
}
