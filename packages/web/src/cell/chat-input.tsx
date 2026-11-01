import { ActionIcon, Group, Popover, Textarea } from "@mantine/core";
import { useState } from "react";
import { useCommandMenu } from "../hooks/use-command-menu.ts";
import { CommandMenu } from "./command-menu.tsx";

// Longer prompts are rejected by the Cell.
const MAX_CHARS = 16384;

const SendIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

/** Textarea with the command menu; Enter submits, and the text clears only if `onSubmit` resolves true. */
export function ChatInput({
  onSubmit,
  placeholder,
}: {
  onSubmit: (line: string) => Promise<boolean>;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const menu = useCommandMenu(text, setText);

  const submit = async () => {
    const line = text.trim();
    if (!line || busy) return;
    setBusy(true);
    try {
      if (await onSubmit(line)) setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Group maw={800} w="100%" mx="auto" p="md" align="flex-end" wrap="nowrap">
      <Popover
        opened={menu.open}
        position="top-start"
        width="target"
        shadow="md"
        transitionProps={{ duration: 0 }}
      >
        <Popover.Target>
          <Textarea
            flex={1}
            autosize
            minRows={1}
            maxRows={6}
            maxLength={MAX_CHARS}
            placeholder={placeholder}
            value={text}
            onChange={(e) => {
              setText(e.currentTarget.value);
              menu.reset();
            }}
            onKeyDown={(e) => {
              // Enter confirms an IME candidate; don't submit.
              if (e.nativeEvent.isComposing || menu.onKeyDown(e)) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </Popover.Target>
        <Popover.Dropdown p={4}>
          <CommandMenu
            commands={menu.matches}
            active={menu.index}
            onHover={menu.setActive}
            onSelect={menu.select}
          />
        </Popover.Dropdown>
      </Popover>
      <ActionIcon
        size="input-sm"
        aria-label="Send"
        onClick={submit}
        loading={busy}
      >
        <SendIcon />
      </ActionIcon>
    </Group>
  );
}
