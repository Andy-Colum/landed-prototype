// Readable view of logs/ai_log.jsonl.
//   npm run log          -> last 20 entries, short
//   npm run log -- full  -> last 5 entries, everything (including full instructions and inputs)
import fs from "node:fs";
import { LOG_FILE } from "../backend/logger.js";

const full = process.argv.includes("full");
if (!fs.existsSync(LOG_FILE)) {
  console.log("No log yet. Run the prototype and trigger the job search first.");
  process.exit(0);
}
const entries = fs.readFileSync(LOG_FILE, "utf8").trim().split("\n").map((l) => JSON.parse(l));

for (const e of entries.slice(full ? -5 : -20)) {
  const t = e.time.replace("T", " ").slice(0, 19);
  if (full) {
    console.log(`\n===== ${t}  ${e.type} =====`);
    console.log(JSON.stringify(e, null, 2));
    continue;
  }
  if (e.type === "ai_request") {
    console.log(`\n${t}  AI REQUEST ${e.request_id}  ${e.step}  mode=${e.mode}  model=${e.model}  ${e.duration_ms ?? "?"} ms`);
    if (e.agent_steps) {
      console.log(`   Agent steps (${e.agent_steps.length}):`);
      for (const st of e.agent_steps) {
        const back = Array.isArray(st.came_back) ? `${st.came_back.length} results` : JSON.stringify(st.came_back ?? "").slice(0, 90);
        console.log(`     ${st.step}. ${st.tool}  sent: ${JSON.stringify(st.sent).slice(0, 110)}  ->  ${back}`);
      }
    }
    if (e.error) console.log(`   ERROR: ${e.error.message}`);
    else if (typeof e.output === "string") console.log(`   ${e.output.slice(0, full ? undefined : 600)}${e.output.length > 600 ? " ..." : ""}`);
    else if (e.step === "resume_parsing") {
      console.log(`   Name: ${e.output.candidate_name}   ${e.output.facts.length} facts`);
      for (const f of e.output.facts) console.log(`   ${f.id.padEnd(5)} conf=${f.confidence}  ${f.source === "resume" ? "" : "[" + f.source + "] "}${f.text}`);
      if (e.usage) console.log(`   tokens in=${e.usage.input_tokens} out=${e.usage.output_tokens}`);
    } else {
      console.log(`   Summary: ${e.output.candidate_summary}`);
      if (e.output.candidate_stage) console.log(`   Stage: ${e.output.candidate_stage}`);
      for (const r of [...e.output.roles].sort((a, b) => a.rank - b.rank)) {
        const reqs = r.requirements.map((q) => `${q.requirement_id}:${q.status}`).join(" ");
        const rel = r.relevant === undefined ? "" : r.relevant ? "RELEVANT " : "hidden   ";
        console.log(`   #${r.rank} ${rel}${r.role_id}  chance=${r.interview_chance}  confidence=${r.confidence}  [${reqs}]${r.relevant === false ? "  -> " + r.relevance_reason : ""}`);
      }
      if (e.usage) console.log(`   tokens in=${e.usage.input_tokens} out=${e.usage.output_tokens}`);
    }
  } else {
    const { time, type, ...rest } = e;
    console.log(`${t}  FEEDBACK ${JSON.stringify(rest)}`);
  }
}
console.log(`\n(${entries.length} entries in ${LOG_FILE})`);
