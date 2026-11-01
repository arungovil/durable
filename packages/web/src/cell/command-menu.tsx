import { Code, Group, Text, UnstyledButton } from "@mantine/core";
import { COLORS } from "../colors.ts";
import { type CommandInfo, usage } from "../commands.ts";

/** The popover list. Mouse down is cancelled to keep input focus. */
export function CommandMenu({
  commands,
  active,
  onHover,
  onSelect,
}: {
  commands: CommandInfo[];
  active: number;
  onHover: (index: number) => void;
  onSelect: (command: CommandInfo) => void;
}) {
  return (
    <div role="listbox" aria-label="Commands">
      {commands.map((c, i) => (
        <UnstyledButton
          key={c.name}
          role="option"
          aria-selected={i === active}
          display="block"
          w="100%"
          px="xs"
          py={6}
          bg={i === active ? COLORS.menuActive : undefined}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onHover(i)}
          onClick={() => onSelect(c)}
        >
          <Group gap="xs" wrap="nowrap">
            <Code>{usage(c)}</Code>
            <Text size="sm" c={COLORS.muted} truncate>
              {c.what}
            </Text>
          </Group>
        </UnstyledButton>
      ))}
    </div>
  );
}
