import { Code, Paper, Spoiler, Stack, Text, Typography } from "@mantine/core";
import type { HistoryEntry } from "@pairable/protocol";
import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { COLORS } from "../colors.ts";

type Content = string | { type: string; text?: string }[];

const textOf = (content: Content) =>
  typeof content === "string"
    ? content
    : content
        .flatMap((p) => (p.type === "text" && p.text ? [p.text] : []))
        .join("\n");

// Keep the model's line breaks and indentation.
const PRE = { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } as const;

/** The argument that says what a tool call did: the command or path. */
const gist = (args: HistoryEntry["args"]) => {
  const v = args?.command ?? args?.path;
  return typeof v === "string" ? v : "";
};

/**
 * False for entries with nothing to draw, such as an assistant turn that only called tools
 * (the results show instead). The list drops them: a virtualized row cannot be empty.
 */
export const isVisible = ({ message }: HistoryEntry) =>
  message.role !== "assistant" ||
  message.stopReason === "error" ||
  textOf(message.content) !== "";

/** One chat message; the entry must be visible. Memoized: shown entries never change. */
export const Message = memo(function Message({
  entry,
}: {
  entry: HistoryEntry;
}) {
  const { message, author, text: typed, args } = entry;
  switch (message.role) {
    case "user": {
      const text = textOf(message.content);
      const body = typed ?? text;
      return (
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            {author ?? "user"}
          </Text>
          <Text style={PRE}>{body}</Text>
        </Stack>
      );
    }
    case "assistant": {
      // Thinking is hidden.
      const text = textOf(message.content);
      const failed = message.stopReason === "error";
      console.log("R", text);
      return (
        <Stack gap={2}>
          <Text size="sm" fw={600} c={COLORS.muted}>
            assistant
          </Text>
          {text && (
            <Typography style={{ overflowWrap: "anywhere" }}>
              <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
            </Typography>
          )}
          {failed && (
            <Text c={COLORS.error} style={PRE}>
              {message.errorMessage ?? "the model failed"}
            </Text>
          )}
        </Stack>
      );
    }
    case "toolResult":
      return (
        <Paper
          withBorder
          p="xs"
          radius="sm"
          bd={message.isError ? `1px solid ${COLORS.error}` : undefined}
        >
          <Text size="sm" fw={600} truncate>
            {message.toolName}{" "}
            <Text span c={COLORS.muted}>
              {gist(args)}
            </Text>
          </Text>
          <Spoiler maxHeight={96} showLabel="Show more" hideLabel="Show less">
            <Code block style={PRE}>
              {textOf(message.content)}
            </Code>
          </Spoiler>
        </Paper>
      );
  }
});
