import {
  Avatar,
  Box,
  Button,
  CopyButton,
  Group,
  Text,
  Tooltip,
} from "@mantine/core";
import { COLORS, filled } from "../colors.ts";
import type { Status } from "../status.ts";

const LABEL: Record<Status, string> = {
  idle: "not in a session",
  connecting: "connecting",
  connected: "connected",
  reconnecting: "reconnecting",
};

const MAX_AVATARS = 3;

/**
 * Connection left, participants right, aligned with the chat column.
 * `id` is empty outside a cell.
 */
export function CellHeader({
  id,
  name,
  state,
  participants,
}: {
  id: string;
  name: string;
  state: Status;
  participants: string[];
}) {
  const label = LABEL[state];
  const people = participants.length > 0 ? participants : name ? [name] : [];
  const shown = people.slice(0, MAX_AVATARS);
  return (
    <Group
      maw={800}
      w="100%"
      mx="auto"
      px="md"
      py="xs"
      justify="space-between"
      wrap="nowrap"
    >
      <Group gap="xs" wrap="nowrap">
        <Text fw={600}>Durable</Text>
        <Box
          w={8}
          h={8}
          bg={filled(COLORS.status[state])}
          style={{ borderRadius: "50%", flexShrink: 0 }}
        />
        <Text size="sm" c={COLORS.muted}>
          {id ? `${id.slice(0, 8)} · ${label}` : label}
        </Text>
        {id && (
          <CopyButton value={id}>
            {({ copied, copy }) => (
              <Button size="compact-xs" variant="subtle" onClick={copy}>
                {copied ? "Copied" : "Copy id"}
              </Button>
            )}
          </CopyButton>
        )}
      </Group>
      <Avatar.Group>
        {shown.map((n) => (
          <Tooltip key={n} label={n}>
            <Avatar name={n} color={COLORS.avatar} size="sm" />
          </Tooltip>
        ))}
        {people.length > shown.length && (
          <Avatar size="sm">+{people.length - shown.length}</Avatar>
        )}
      </Avatar.Group>
    </Group>
  );
}
