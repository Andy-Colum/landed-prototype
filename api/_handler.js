// Shared wrapper: turns an AI step from backend/ai.js into a Vercel serverless function.
import { writeLog } from "../backend/logger.js";

export const aiHandler = (fn) => async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    res.status(200).json(await fn(body));
  } catch (err) {
    console.error("AI request failed:", err.message);
    res.status(502).json({ error: err.message, request_id: err.request_id });
  }
};
export { writeLog };
