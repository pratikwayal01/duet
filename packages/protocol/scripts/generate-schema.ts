import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildJsonSchema } from "../src/index.js";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "schema");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "protocol.json"), JSON.stringify(buildJsonSchema(), null, 2) + "\n");
console.log("wrote schema/protocol.json");
