// Small local server: shows the prototype in the browser and passes the job-matching step to the AI.
// Start with `npm start`, then open http://localhost:5173
import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchJobs, parseResume, loadConfig } from "./ai.js";
import { writeLog, LOG_FILE } from "./logger.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
const PORT = Number(process.env.PORT) || 5173;
const PUBLIC_FILES = { "/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/styles.css": "styles.css", "/simulated_responses.json": "simulated_responses.json" };
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 25 * 1024 * 1024) throw new Error("Request too large (max 25 MB).");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    // The two AI steps. Each: resume in, structured JSON out.
    const AI_ROUTES = { "/api/parse-resume": parseResume, "/api/match-jobs": matchJobs };
    if (req.method === "POST" && AI_ROUTES[url.pathname]) {
      const body = await readBody(req);
      try {
        return sendJson(res, 200, await AI_ROUTES[url.pathname](body));
      } catch (err) {
        console.error("AI request failed:", err.message);
        return sendJson(res, 502, { error: err.message, request_id: err.request_id });
      }
    }
    // Feedback clicks from the prototype (accept, reject, correct) go into the same log.
    if (req.method === "POST" && url.pathname === "/api/feedback") {
      const body = await readBody(req);
      writeLog({ type: "user_feedback", ...body });
      return sendJson(res, 200, { ok: true });
    }
    // The prototype's own files.
    const file = PUBLIC_FILES[url.pathname];
    if (req.method === "GET" && file) {
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] });
      return fs.createReadStream(path.join(ROOT, file)).pipe(res);
    }
    res.writeHead(404).end("Not found");
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
});

server.listen(PORT, () => {
  const cfg = loadConfig();
  console.log(`\nLanded prototype running at http://localhost:${PORT}`);
  for (const [step, c] of Object.entries(cfg).filter(([k]) => !k.startsWith("_"))) console.log(`AI step ${step}: ${c.mode}${c.mode === "real" ? ` (${c.provider} / ${c.model})` : ""}`);
  if (Object.values(cfg).some((c) => c.mode === "real") && (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "paste-your-key-here")) console.log("WARNING: no ANTHROPIC_API_KEY in .env. AI calls will fail until you add it.");
  console.log(`Log file: ${path.relative(ROOT, LOG_FILE)}   (readable view: npm run log)\nPress Ctrl+C to stop.\n`);
});
