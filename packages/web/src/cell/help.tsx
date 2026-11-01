import { Code, Stack, Text, Title } from "@mantine/core";
import { COLORS } from "../colors.ts";
import { COMMANDS, usage } from "../commands.ts";

/** Shown instead of the message list outside a cell. */
export function Help() {
  return (
    <Stack maw={800} w="100%" mx="auto" p="md" flex={1} justify="center">
      <Title order={3}>Welcome to Durable</Title>
      <Text c={COLORS.muted}>Type a command below to get started.</Text>
      {COMMANDS.map((c) => (
        <Text key={c.name}>
          <Code>{usage(c)}</Code> {c.what}
        </Text>
      ))}
    </Stack>
  );
}
