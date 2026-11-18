import { writeLog } from "../backend/logger.js";
export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  writeLog({ type: "user_feedback", ...body });
  res.status(200).json({ ok: true });
}
