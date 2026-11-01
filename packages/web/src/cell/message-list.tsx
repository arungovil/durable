import type { HistoryEntry } from "@durable/protocol";
import { Box, Group, Loader, Text } from "@mantine/core";
import { type ReactNode, useMemo } from "react";
import { type ContextProp, Virtuoso } from "react-virtuoso";
import { COLORS } from "../colors.ts";
import { isVisible, Message } from "./message.tsx";

/** Centers content in the chat column, aligned with the header and input. */
const Column = ({ children }: { children?: ReactNode }) => (
  <Box maw={800} w="100%" mx="auto" px="md">
    {children}
  </Box>
);

/** Space above the first message. */
const Header = () => <Box h="md" />;

/** The agent's status line below the last message; also keeps space under it. */
const Footer = ({ context }: ContextProp<{ run?: string }>) => (
  <Column>
    <Group gap="xs" mih={40} align="center">
      {context?.run && (
        <>
          <Loader size="xs" type="dots" />
          <Text size="sm" c={COLORS.muted}>
            {context.run}
          </Text>
        </>
      )}
    </Group>
  </Column>
);

/** Only the visible messages are in the DOM. Follows new output while at the bottom. */
export function MessageList({
  entries,
  run,
}: {
  entries: HistoryEntry[];
  run: string | undefined;
}) {
  const visible = useMemo(() => entries.filter(isVisible), [entries]);
  return (
    <Virtuoso
      style={{ flex: 1, minHeight: 0 }}
      data={visible}
      computeItemKey={(_, e) => e.id}
      context={{ run }}
      components={{ Header, Footer }}
      followOutput={(atBottom) => (atBottom ? "auto" : false)}
      itemContent={(_, e) => (
        <Column>
          <Box pb="md">
            <Message entry={e} />
          </Box>
        </Column>
      )}
    />
  );
}
