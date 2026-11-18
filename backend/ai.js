// All real AI lives in this file.
//
// callModel()  = the ONE function that talks to an AI provider. To switch models,
//                change "model" in config.json. To add another provider, add a branch here.
// parseResume() = AI step 1, "Verify your profile": reads the resume into facts the user confirms.
// matchJobs()   = AI step 2, job matching. With role_source "web_search" it is a small agent:
//                 call A searches the web for real openings (each search / page read is logged as a step),
//                 call B ranks what was found, with relevance, interview chance and matches/gaps.
// Every step builds its instructions + inputs, calls callModel(), and logs everything to logs/ai_log.jsonl.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { writeLog } from "./logger.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");

export function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
}

/* ------------------------------------------------------------------ */
/* 1. The one function that calls the AI model                         */
/* ------------------------------------------------------------------ */
export async function callModel({ provider, model, max_tokens, effort, system, content, schema, tools }) {
  if (provider !== "anthropic") {
    throw new Error(`Provider "${provider}" is not set up yet. Add it in backend/ai.js -> callModel().`);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "paste-your-key-here") {
    throw new Error("No API key found. Copy .env.example to .env and paste your ANTHROPIC_API_KEY.");
  }
  // Key comes from .env. The address is fixed so other tools' settings on the laptop can't redirect the call.
  const client = new Anthropic({ apiKey, authToken: null, baseURL: "https://api.anthropic.com" });

  const messages = [{ role: "user", content }];
  const steps = []; // agent steps: every tool the model used, what it sent, what came back
  const usage = {};
  let response;
  // With web tools the server runs the search loop; it may pause after many tool calls ("pause_turn"),
  // and we send the conversation back so it can carry on.
  for (let round = 0; round < 6; round++) {
    response = await client.beta.messages.create({
      model,
      max_tokens,
      system,
      messages,
      ...(tools ? { tools } : {}),
      // effort = how hard the model thinks. format (when given) forces JSON matching our schema.
      output_config: { effort, ...(schema ? { format: { type: "json_schema", schema } } : {}) },
      // If the model declines for a safety reason, the API retries on a fallback model automatically.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    addUsage(usage, response.usage);
    steps.push(...describeSteps(response.content, steps.length));
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }

  if (response.stop_reason === "refusal") {
    throw new Error(`The model declined this request (${response.stop_details?.category ?? "no category"}).`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The answer was cut off (hit max_tokens). Raise max_tokens in config.json.");
  }
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return {
    output: schema ? JSON.parse(text) : text,
    steps,
    model_used: response.model,
    stop_reason: response.stop_reason,
    usage,
  };
}

// Adds up token and tool counts across rounds.
function addUsage(total, u) {
  for (const [k, v] of Object.entries(u || {})) {
    if (typeof v === "number") total[k] = (total[k] || 0) + v;
    else if (v && typeof v === "object") addUsage((total[k] ||= {}), v);
  }
}

// Turns the model's tool calls and their results into readable log steps.
function describeSteps(blocks, offset) {
  const steps = [];
  const byId = {};
  for (const b of blocks) {
    if (b.type === "server_tool_use") {
      const step = { step: offset + steps.length + 1, tool: b.name, sent: b.input, came_back: null };
      byId[b.id] = step;
      steps.push(step);
    } else if (b.tool_use_id && byId[b.tool_use_id]) {
      byId[b.tool_use_id].came_back = summarizeResult(b);
    }
  }
  return steps;
}
function summarizeResult(b) {
  const c = b.content;
  if (Array.isArray(c)) return c.map((r) => (r.url ? { title: r.title, url: r.url, page_age: r.page_age ?? null } : { type: r.type }));
  if (c?.error_code) return { error: c.error_code };
  if (c?.type === "web_fetch_result") return { url: c.url, fetched: true, title: c.content?.title ?? null };
  if (c?.stdout !== undefined) return { stdout: String(c.stdout).slice(0, 1500), return_code: c.return_code };
  return { type: b.type };
}

/* ------------------------------------------------------------------ */
/* 2. The job-matching step                                            */
/* ------------------------------------------------------------------ */
const SYSTEM_PROMPT = `You are the job-matching engine inside Landed, a job application assistant for MBA students.

You receive a candidate's resume, the candidate's stated preferences, today's date, and a list of open roles (internships and full-time roles) with their requirements.
Your job: build a shortlist of roles that are RELEVANT to this candidate AND give them the best chance of getting an interview, and show exactly where their profile matches each role and where the gaps are.

Step 1: work out the candidate's career stage from their graduation date and today's date.
- An MBA student who graduates before the next internship summer starts (for example graduating in June 2027 when the internship summer is summer 2027), or who has already graduated, needs FULL-TIME roles that start after graduation. Internships are not relevant to them.
- An MBA student with at least one summer before graduation (for example graduating in June 2028, with summer 2027 still ahead) needs a summer INTERNSHIP. Full-time roles that start before they graduate are not relevant to them.
- A full-time role is relevant if it starts on or after graduation, has a flexible start, or is a post-MBA-level role the candidate could realistically pursue around graduation; lower interview_chance for roles that must start immediately, and say so. An internship is only relevant if it runs before graduation.

Step 2: decide relevance for every role.
- relevant = false when the employment type or start date does not fit the career stage (Step 1), when the seniority is wrong for someone coming out of an MBA (ALWAYS relevant = false for titles containing Staff, Principal, Group, Lead of a team, Head of, Director or VP, and for programs for 0-2 years of experience when the candidate has many more), or when the role clearly conflicts with what the candidate wants (a function, industry or location they did not ask for and have no background in). Say why in relevance_reason.
- relevant = true for roles that fit the career stage and reasonably fit the candidate's target roles, industries and locations. A role can be relevant with some gaps.

Step 3: assess every requirement of every role and give a status:
  - "match": the resume or preferences clearly show the candidate meets it. Quote or paraphrase the evidence.
  - "gap": the candidate clearly does NOT meet a must-have requirement (for example graduation date out of range, too few years of experience, no work authorization).
  - "unsure": no evidence either way, the requirement is only "preferred", or it is subjective (like "product sense"). Say what evidence is missing so the candidate can answer it themselves.

Step 4: score and rank.
- interview_chance: your estimate (0 to 1) of the probability this candidate gets an interview if they apply, considering fit with requirements, fit with their preferences, and competitiveness. A role that does not fit their career stage scores near 0.
- confidence: how confident you are (0 to 1) in your assessment of this role, lower when key evidence is missing.
- Rank 1 = the best role to apply to. All relevant roles come before all non-relevant roles. Within the relevant roles, order by interview_chance, and put roles with a must-have gap below roles without one. Include every role exactly once.

Rules:
- Use only evidence that is in the resume or the stated preferences. Never invent experience, skills, dates or credentials.
- candidate_stage: one short phrase, e.g. "Graduating June 2027: needs a full-time role starting after graduation".
- If the roles come from a list with role_id and requirement_id values, copy those ids exactly.
- If the roles come from a web search report: use only roles that are in the report, copy company, title, location and url exactly, make role_id a short lowercase slug (e.g. "stripe-pm-sf"), and take the requirements from what the report says the posting asks for (3 to 6 key ones, ids "r1", "r2", ...). Never invent a role, a link or a requirement.
- Keep text short and specific: one sentence per requirement, written to the candidate ("You ...").`;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidate_summary", "candidate_stage", "roles"],
  properties: {
    candidate_summary: { type: "string", description: "Two sentences on the candidate's profile as read from the resume." },
    candidate_stage: { type: "string" },
    roles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role_id", "company", "title", "location", "employment_type", "start", "deadline", "url", "relevant", "relevance_reason", "rank", "interview_chance", "confidence", "why", "strengths", "gaps", "requirements"],
        properties: {
          role_id: { type: "string" },
          company: { type: "string" },
          title: { type: "string" },
          location: { type: "string" },
          employment_type: { type: "string", description: "Full-time, Internship, or Contract" },
          start: { type: "string", description: "Start date or season, or \"\" if not stated" },
          deadline: { type: "string", description: "Application deadline, or \"\" if not stated" },
          url: { type: "string", description: "Link to the posting, or \"\" for roles from the sample list" },
          relevant: { type: "boolean" },
          relevance_reason: { type: "string", description: "One sentence on why this role does or does not fit the candidate's stage and goals." },
          rank: { type: "integer" },
          interview_chance: { type: "number" },
          confidence: { type: "number" },
          why: { type: "string", description: "One sentence on why this role is ranked here." },
          strengths: { type: "array", items: { type: "string" } },
          gaps: { type: "array", items: { type: "string" } },
          requirements: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["requirement_id", "text", "status", "evidence"],
              properties: {
                requirement_id: { type: "string" },
                text: { type: "string", description: "The requirement as the posting states it" },
                status: { type: "string", enum: ["match", "gap", "unsure"] },
                evidence: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

// Call A of the web-search agent: find real, currently open roles.
const SEARCH_PROMPT = `You are the job-search agent inside Landed, a job application assistant for MBA students.

Use web search (and web fetch to open postings) to find real job postings that are open now and relevant to this candidate.

1. First work out the candidate's career stage from their graduation date and today's date:
   - Graduating before the next internship summer (or already graduated): search for FULL-TIME roles starting after graduation, especially MBA / post-MBA roles. Do not return internships.
   - At least one summer before graduation: search for summer MBA INTERNSHIPS for that summer. Do not return full-time roles.
2. Search broadly. Use several different searches across the candidate's target functions, industries and locations:
   - Roles labelled for MBAs (MBA programs, rotational and leadership-development programs, "MBA Associate"), AND
   - Post-MBA-level roles that are not labelled MBA but fit their background and seniority (e.g. Product Manager, Senior Associate, Strategy Manager), at companies in their target industry and adjacent ones (big tech, banks' digital teams, well-funded startups).
   For full-time roles, prefer ones that start after graduation or have a flexible start. If a role starts right away, still include it but say "START: immediate" so the ranking can weigh it.
   Search where real open postings live: company career pages and applicant-tracking job boards, e.g. queries like
   "site:boards.greenhouse.io product manager fintech New York", "site:jobs.lever.co ...", "site:jobs.ashbyhq.com ...".
   Match seniority to an MBA graduate: Associate, Product Manager, Senior Associate, Manager level. Skip Staff, Principal, Director, VP and entry-level "new grad 0-2 years" roles unless the candidate's experience clearly fits.
3. Open the most promising postings to check they are open, and read the type, location, start date, deadline and requirements. Do not spend more than one attempt on a page that will not load.
4. Aim for 8 to 10 distinct, open roles. If MBA programs have closed for the season, fill the list with fitting post-MBA-level roles and say so in one line. Include a mix: some stretch roles and some where the candidate is a strong fit.

Rules:
- Only report roles you actually found in search results or fetched pages, with their real link. Never invent a role, company, link or requirement.
- If a posting looks closed or old (more than about 2 months), leave it out.

Finish with a plain report, no preamble. First line: "Career stage: ..." Then one block per role:
ROLE: <title>
COMPANY: <company>
LOCATION: <location>
TYPE: <Full-time / Internship>
START: <start date or "not stated">
DEADLINE: <deadline or "not stated">
URL: <link>
REQUIREMENTS: <the key requirements the posting lists, separated by " | ">`;

// The pool of open roles comes from the prototype's data file (the job search itself stays simulated).
function loadRolePool() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "simulated_responses.json"), "utf8"));
  return [...data.roles, ...(data.fulltime_roles || [])].map((r) => ({
    role_id: r.id,
    company: r.company,
    title: r.title,
    employment_type: r.employmentType,
    start: r.start,
    location: r.location,
    deadline: r.deadline,
    requirements: r.requirements.map((q) => ({ requirement_id: q.id, text: q.text, ...(q.postingText ? { posting_text: q.postingText } : {}) })),
  }));
}

/* ------------------------------------------------------------------ */
/* Shared plumbing for every AI step: resume input, the call, the log  */
/* ------------------------------------------------------------------ */

// A real PDF goes to the model as a document; the example user gets a sample text resume.
function resumeInput(resume) {
  if (resume?.kind === "pdf" && resume.data) {
    return {
      block: { type: "document", source: { type: "base64", media_type: "application/pdf", data: resume.data } },
      forLog: `[PDF file "${resume.name}", ${Math.round((resume.data.length * 3) / 4 / 1024)} KB, sent to the model as a document]`,
    };
  }
  const text = fs.readFileSync(path.join(here, "sample_resume.txt"), "utf8");
  return { block: { type: "text", text: `<resume>\n${text}\n</resume>` }, forLog: text };
}

// The candidate's confirmed facts (their edits included; deleted and unconfirmed facts are never sent).
// When facts are given, the original resume is NOT sent, so nothing the candidate removed can leak back in.
function factsInput(facts) {
  const clean = facts
    .filter((f) => f && typeof f.text === "string" && f.text.trim())
    .slice(0, 200)
    .map((f) => ({ id: String(f.id ?? "").slice(0, 20), category: String(f.category ?? "").slice(0, 60), text: f.text.trim().slice(0, 500) }));
  const lines = clean.map((f) => `- [${f.category}] ${f.text}`).join("\n");
  return {
    block: { type: "text", text: `<confirmed_facts>
These are the only facts the candidate has confirmed about themselves. Treat them as the resume. Nothing else is known.
${lines}
</confirmed_facts>` },
    forLog: { confirmed_facts: clean },
  };
}

// Runs one AI step (or skips it in simulated mode) and writes one log entry with input, output or error.
async function runStep({ step, label, system, content, schema, tools, logInput }) {
  const cfg = loadConfig()[step];
  const request_id = "req_" + crypto.randomBytes(4).toString("hex");
  const started = Date.now();
  const logBase = { type: "ai_request", step: label || step, request_id, mode: cfg.mode, provider: cfg.provider, model: cfg.model, input: { instructions: system, ...logInput } };

  if (cfg.mode !== "real") {
    writeLog({ ...logBase, output: "simulated: canned answers used, no AI call", duration_ms: 0 });
    return { mode: "simulated", request_id };
  }
  try {
    const result = await callModel({ provider: cfg.provider, model: cfg.model, max_tokens: cfg.max_tokens, effort: cfg.effort, system, content, schema, tools });
    writeLog({
      ...logBase,
      ...(result.steps.length ? { agent_steps: result.steps } : {}),
      output: result.output,
      model_used: result.model_used,
      stop_reason: result.stop_reason,
      usage: result.usage,
      duration_ms: Date.now() - started,
    });
    return schema ? { mode: "real", request_id, model: result.model_used, ...result.output } : { mode: "real", request_id, model: result.model_used, text: result.output, steps: result.steps };
  } catch (err) {
    writeLog({ ...logBase, error: { name: err.constructor?.name, status: err.status, message: err.message }, duration_ms: Date.now() - started });
    throw Object.assign(new Error(err.message), { request_id });
  }
}

export async function matchJobs({ resume, facts, preferences }) {
  const cfg = loadConfig().job_matching;
  const r = Array.isArray(facts) && facts.length ? factsInput(facts) : resumeInput(resume);
  const today = new Date().toISOString().slice(0, 10);
  const candidate = `<today>${today}</today>\n\n<candidate_preferences>\n${JSON.stringify(preferences, null, 2)}\n</candidate_preferences>`;

  // Where the roles come from: a real web search (default), or the fixed sample list in simulated_responses.json.
  let rolesText, rolesForLog, search = null;
  if (cfg.mode === "real" && cfg.role_source === "web_search") {
    search = await runStep({
      step: "job_matching",
      label: "job_search",
      system: SEARCH_PROMPT,
      content: [r.block, { type: "text", text: `${candidate}\n\nFind relevant open roles for this candidate.` }],
      tools: [
        // allowed_callers "direct": the model calls search itself and reads every result. In testing, letting it
        // run searches from inside code used up the search budget on results it never saw.
        { type: "web_search_20250305", name: "web_search", max_uses: cfg.max_searches ?? 10, allowed_callers: ["direct"] },
        { type: "web_fetch_20250910", name: "web_fetch", max_uses: cfg.max_page_reads ?? 8, allowed_callers: ["direct"] },
      ],
      logInput: { resume: r.forLog, today, preferences },
    });
    rolesText = `<web_search_report>\n${search.text}\n</web_search_report>`;
    rolesForLog = `[web search report from request ${search.request_id}]`;
  } else {
    const roles = loadRolePool();
    rolesText = `<open_roles>\n${JSON.stringify(roles, null, 2)}\n</open_roles>`;
    rolesForLog = roles;
  }

  const result = await runStep({
    step: "job_matching",
    system: SYSTEM_PROMPT,
    content: [r.block, { type: "text", text: `${candidate}\n\n${rolesText}\n\nRank these roles for this candidate and show the matches and gaps for every requirement.` }],
    schema: OUTPUT_SCHEMA,
    logInput: { resume: r.forLog, today, preferences, open_roles: rolesForLog, ...(search ? { search_request_id: search.request_id } : {}) },
  });
  return { ...result, role_source: search ? "web_search" : "sample_list", search_request_id: search?.request_id ?? null, search_steps: search?.steps?.length ?? 0 };
}

/* ------------------------------------------------------------------ */
/* 3. The resume-parsing step ("Verify your profile" screen)           */
/* ------------------------------------------------------------------ */
const PARSE_PROMPT = `You are the resume reader inside Landed, a job application assistant for MBA students.

Turn the candidate's resume into a list of short, atomic facts that the candidate will confirm, edit or delete one by one. Landed only ever uses facts the candidate confirms, so accuracy matters more than completeness.

Rules:
- Copy facts from the resume. Never invent, embellish or merge information. Keep each bullet's wording close to the original.
- Use these ids and categories exactly, so other parts of the app can find the facts:
  - "edu1", "edu2", ... category "Education": one per degree, e.g. "Chicago Booth School of Business, MBA, Class of 2028".
  - "grad", category "Graduation date": the expected graduation date of the current or most recent degree, as "Month YYYY" (e.g. "June 2028").
  - "gpa", category "GPA": only if the resume states one.
  - "auth", category "Work authorization": only if stated.
  - "exp1", "exp2", ... category "Role": one per job, most recent first, formatted "Title, Employer (N years)" with N = full years in that job rounded down (use months if under a year, e.g. "(8 months)").
  - "b1", "b2", ... category "Bullet (Employer)": one per accomplishment bullet, numbered across the whole resume in order.
  - "sk1", "sk2", ... category "Skills": skills and tools as written (one fact per skills line is fine).
- "grad" and "auth" must always be present. If the resume does not state them, use the values from <profile_form> (which the candidate typed in) and set source to "profile form".
- source: "resume" or "profile form".
- confidence: 0 to 1, how sure you are this fact is read correctly (lower for ambiguous dates, unclear tenure, or anything you had to interpret).
- candidate_name: the name at the top of the resume, or "" if none.`;

const PARSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidate_name", "facts"],
  properties: {
    candidate_name: { type: "string" },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "category", "text", "source", "confidence"],
        properties: {
          id: { type: "string" },
          category: { type: "string" },
          text: { type: "string" },
          source: { type: "string", enum: ["resume", "profile form"] },
          confidence: { type: "number" },
        },
      },
    },
  },
};

export async function parseResume({ resume, profileForm }) {
  const r = resumeInput(resume);
  return runStep({
    step: "resume_parsing",
    system: PARSE_PROMPT,
    content: [r.block, { type: "text", text: `<profile_form>\n${JSON.stringify(profileForm, null, 2)}\n</profile_form>\n\nExtract the facts from this resume.` }],
    schema: PARSE_SCHEMA,
    logInput: { resume: r.forLog, profile_form: profileForm },
  });
}
