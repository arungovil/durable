import { type ClientMessage, NAME, type Result } from "@pairable/protocol";
import Type from "typebox";
import Value from "typebox/value";

/**
 * What the model reads for a prompt: `[name]: text`. Names cannot contain brackets, and every
 * later line of the text is indented, so only the Cell can put `[name]: ` at the start of a line.
 */
export const toModelPrompt = (name: string, text: string) =>
  `[${name}]: ${text.replace(/\r\n|\r|\n/g, "\n    ")}`;

/** `name` if free, else `name2`, `name3`, ...; the base is cut so the result still fits `LIMITS.name`. */
export function uniqueName(name: string, taken: readonly string[]): string {
  let out = name;
  for (let n = 2; taken.includes(out); n++)
    out = `${[...name].slice(0, LIMITS.name - String(n).length).join("")}${n}`;
  return out;
}

/** Limits on what a client may send; sizes count UTF-16 units. */
export const LIMITS = {
  // shortcut: counts string length, not bytes, so a message can be up to 3x larger on the wire; upgrade if memory matters
  message: 32_768,
  text: 16_384,
  name: 32,
  requestId: 64,
};

// Unknown fields are rejected, not passed through, so a client cannot smuggle data past the handler.
const STRICT = { additionalProperties: false };

// One schema per `type`, picked before validating: a Type.Union would report the first branch's error for every bad message.
const FRAMES = {
  hello: Type.Object(
    {
      type: Type.Literal("hello"),
      name: Type.String({
        minLength: 1,
        maxLength: LIMITS.name,
        pattern: NAME.source,
      }),
    },
    STRICT,
  ),
  prompt: Type.Object(
    {
      type: Type.Literal("prompt"),
      text: Type.String({ maxLength: LIMITS.text, pattern: "\\S" }),
      requestId: Type.String({ minLength: 1, maxLength: LIMITS.requestId }),
    },
    STRICT,
  ),
};

/** Parses and validates one raw WebSocket frame. The error is safe to send back to that client. */
export function parseClientMessage(raw: string): Result<ClientMessage> {
  if (raw.length > LIMITS.message) return fail("message too large");
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return fail("invalid JSON");
  }
  const type = (msg as { type?: unknown } | null)?.type;
  if (typeof type !== "string" || !Object.hasOwn(FRAMES, type))
    return fail("unknown message type");
  const frame = FRAMES[type as keyof typeof FRAMES];
  if (Value.Check(frame, msg)) return { ok: true, value: msg };
  const [e] = Value.Errors(frame, msg);
  return fail(
    e
      ? `invalid ${e.instancePath.slice(1) || "message"}: ${e.message}`
      : "invalid message",
  );
}

function fail(error: string): Result<never> {
  return { ok: false, error };
}
