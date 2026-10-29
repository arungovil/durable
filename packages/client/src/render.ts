import type { HistoryEntry } from "@durable/protocol";
import {
  AssistantMessageComponent,
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  getMarkdownTheme,
  ToolExecutionComponent,
  UserMessageComponent,
} from "@earendil-works/pi-coding-agent";

/** pi's renderers for the tools the Cell runs, so a remote call looks like a local one. */
const DEFINITIONS = {
  read: createReadToolDefinition,
  write: createWriteToolDefinition,
  edit: createEditToolDefinition,
  bash: createBashToolDefinition,
  grep: createGrepToolDefinition,
  find: createFindToolDefinition,
  ls: createLsToolDefinition,
};

// The component only asks for a repaint, which happens anyway when an entry is rebuilt.
const ui = { requestRender() {} } as unknown as ConstructorParameters<
  typeof ToolExecutionComponent
>[5];

const textOf = (content: string | { type: string; text?: string }[]) =>
  typeof content === "string"
    ? content
    : content
        .flatMap((p) => (p.type === "text" && p.text ? [p.text] : []))
        .join("\n");

/** Draws one entry with pi's own components. pi calls it again on expand, so keep it stateless. */
export function renderEntry(
  { message, args }: HistoryEntry,
  expanded: boolean,
) {
  switch (message.role) {
    case "user":
      return new UserMessageComponent(
        textOf(message.content),
        getMarkdownTheme(),
        1,
      );
    case "assistant":
      // Tool calls are drawn as their results' tool boxes.
      return new AssistantMessageComponent(
        message,
        false,
        getMarkdownTheme(),
        "Thinking...",
        1,
      );
    case "toolResult": {
      const cwd = process.cwd();
      const make = Object.hasOwn(DEFINITIONS, message.toolName)
        ? DEFINITIONS[message.toolName as keyof typeof DEFINITIONS]
        : undefined;
      const box = new ToolExecutionComponent(
        message.toolName,
        message.toolCallId,
        args ?? {},
        { outputPad: 1 },
        make?.(cwd),
        ui,
        cwd,
      );
      box.markExecutionStarted();
      box.updateResult({
        content: message.content,
        details: message.details,
        isError: message.isError,
        durationMs: message.durationMs,
      });
      box.setExpanded(expanded);
      return box;
    }
  }
}
