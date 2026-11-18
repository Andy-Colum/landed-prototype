// Simple local log: one JSON object per line in logs/ai_log.jsonl.
// Open the file in any text editor, or run `npm run log` for a readable view.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const LOG_FILE = path.join(here, "..", "logs", "ai_log.jsonl");

export function writeLog(entry) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  const line = JSON.stringify({ time: new Date().toISOString(), ...entry });
  fs.appendFileSync(LOG_FILE, line + "\n");
}
