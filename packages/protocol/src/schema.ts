import { zodToJsonSchema } from "zod-to-json-schema";
import { MESSAGE_TYPES, PROTOCOL_VERSION, messageSchema } from "./messages.js";

// JSON Schema for docs (PRD §7.2). Used by scripts/generate-schema.ts.
export function buildJsonSchema() {
  return {
    $comment: `Duet sync protocol v${PROTOCOL_VERSION}. Unknown message types must be ignored by receivers.`,
    types: [...MESSAGE_TYPES],
    ...zodToJsonSchema(messageSchema, { target: "jsonSchema7", $refStrategy: "none" }),
  };
}
