// Simple local log: one JSON object per line in logs/ai_log.jsonl.
// Open the file in any text editor, or run `npm run log` for a readable view.
// On Vercel the disk is read-only except /tmp, so logs there are printed to the function logs instead.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const LOG_FILE = path.join(here, "..", "logs", "ai_log.jsonl");

export function writeLog(entry) {
  const line = JSON.stringify({ time: new Date().toISOString(), ...entry });
  if (process.env.VERCEL) { console.log("ai_log", line); return; }
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (err) { console.error("Could not write log:", err.message); }
}
