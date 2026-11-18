# Landed prototype

A clickable prototype of Landed. Two AI steps are connected to a real AI model:

> **1. Resume reading ("Verify your profile"):** Landed reads the uploaded resume and turns it into short facts (education, graduation date, roles, bullets, skills), each with an AI confidence score. The candidate confirms, edits or deletes each one, and Landed only uses confirmed facts.
>
> **2. Job search and matching (a small AI agent):** The AI reads the resume, works out the candidate's career stage, and searches the web for real open roles. A June 2027 graduate gets full-time roles; a June 2028 graduate gets summer 2027 internships. It then ranks the roles by relevance and chance of an interview. For each role it shows an interview-chance score, a confidence score, where the candidate matches, the gaps, a status for every requirement, and a link to the posting. Roles it judges not relevant (wrong career stage, wrong seniority, wrong function) are hidden, each with a reason, and the candidate can add them back.

Every other AI step (tailoring, interview feedback, etc.) is still **simulated** with canned answers from `simulated_responses.json`. Those canned answers are written for the example candidate, Priya Shah.

---

## Set it up on your own laptop (about 10 minutes, one time)

### 1. Install Node.js
Download the **LTS** version from https://nodejs.org and install it like any other app.
To check it worked, open **Terminal** (Mac: press Cmd+Space, type "Terminal") and run:
```bash
node -v
```
You should see a version number like `v24.x`. Anything from v20 up works.

### 2. Get the project folder
Unzip the project somewhere on your laptop (double-click the zip). In Terminal, go into the `landed-prototype` folder. Type `cd ` (with a space), drag the folder from Finder into the Terminal window, and press Enter.

The zip deliberately leaves out three things, which is why steps 3 and 4 exist: the installed packages (`node_modules`, you download them in step 3), the API key file (`.env`, you make your own in step 4), and the test log (`logs`, created when you first use the AI).

### 3. Install the project's packages
```bash
npm install
```
This downloads the two libraries the backend uses into a `node_modules` folder. You only need to do this once.

### 4. Add your own API key
1. Go to https://console.anthropic.com, sign in, open **API Keys**, and click **Create Key**. Copy the key (it starts with `sk-ant-`).
   Your account needs a little credit (Settings → Billing). One full run with the web search costs roughly 30 cents to 1 dollar (it depends on how many pages the AI reads). With the fixed sample list instead, it's about 5 cents.
2. In the project folder, make a copy of `.env.example` and name it `.env`. In Terminal:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` in any text editor (on a Mac: `open -e .env`). Replace `paste-your-key-here` with your key and save.

## Happy path (Priya Shah)
1. Sign in with school account, click **Fill with example**, Continue.
2. Verify profile: **Confirm all remaining**, Save verified profile.
3. Career journal: use the three quick-example buttons, **+ Add entry** for each, then **Confirm as true** on each.
4. Job recs: **Simulate the overnight search** (or the demo bar button), then open the notification.
   - Each card shows an interview-chance band (High/Medium/Low), an **Early estimate** tag when Landed has few outcomes for that employer, and **Why this role**.
   - The 5th card is a **Stretch pick** (lower chance, matches the goal); **Swap for a safer role** replaces it with Rivet.
   - **Filtered out by Landed** lists close matches that failed a hard requirement; **I do qualify** brings one back.
5. Open Acme Fintech, answer **I qualify** on "Strong product sense", **Prepare application**.
6. Review resume/cover letter. Unchanged lines are auto-accepted; only changed lines need a decision. Lines with a **New claim** (text no source supports) can't be accepted until you **Remove claim** or confirm it's true. Reverted lines show **Undo**. **Save and continue** unlocks once every change is reviewed.
7. Fill the two yellow fields, **Approve & Submit**.
8. Applications tab: demo bar **Fast-forward 2 weeks**, answer the prompt with "Yes, interview", pick a date.
9. Interview prep: practice an answer, **Simulate: interview finished**, write a reflection, rate it.
10. Applications tab: **Mark outcome… > Offer**, then **Accept offer**.

**Never share your `.env` file**: don't email it, put it in Slack, or upload it to GitHub. It's listed in `.gitignore` so git skips it. Each teammate uses their own key.

> Tip: files that start with a dot are hidden in Finder. Press **Cmd+Shift+.** to show them.

### 5. Start the prototype
```bash
npm start
```
Then open **http://localhost:5173** in your browser. Keep the Terminal window open while you use the prototype. Press **Ctrl+C** to stop it.

---

## Try the AI steps

1. Click **Sign in with school account**.
2. Either upload a real resume (PDF) and fill in the fields, **or** click **Fill with example (Priya Shah)**, which uses the sample resume in `backend/sample_resume.txt`. Then click **Continue**.
3. Wait 10 to 30 seconds while the AI reads the resume. On **Verify your profile**, check each fact. Each one shows the AI's confidence, and anything taken from the form rather than the resume is labelled. Confirm, edit or delete each one (or **Confirm all remaining**), then click **Save verified profile**.
4. Go to **Job recs** and click **Simulate the overnight search**.
5. After the animation, the AI searches the web and ranks what it finds. In testing this took 1 to 2.5 minutes. Then open the notification. Each role card shows:
   - a blue **AI match** box with the interview chance, confidence, why it's ranked there, where you match, and the gaps
   - every requirement marked ✓ match, ✗ gap, or ? unsure, with the AI's evidence
   - for roles found on the web, a **View posting ↗** link. Always check the posting is still open: the AI can be wrong about that.

   Below the list, **Hidden: not relevant for you** shows what the AI filtered out and why. **It's relevant to me, show it** adds a role back.

   If the AI isn't sure about a requirement, you answer it yourself ("I qualify / I don't qualify / Not sure").

The rest of the happy path works as before, with simulated responses:

1. Career journal: use the three quick-example buttons, **+ Add entry** for each, then **Confirm as true** on each.
2. Open a role, answer any flagged requirement, then click **Prepare application**.
3. Review resume/cover letter (accept/edit/revert, Source tags, regenerate), then **Save and continue**.
4. Fill the two yellow fields, then **Approve & Submit**.
5. Applications tab: demo bar **Fast-forward 2 weeks**, answer the prompt with "Yes, interview", and pick a date.
6. Interview prep: practice an answer, click **Simulate: interview finished**, write a reflection, and rate it.
7. Applications tab: **Mark outcome… > Offer**, then **Accept offer**.

---

## Switching models, or going back to simulated

Everything is in **`config.json`**. There is one section per AI step, `resume_parsing` and `job_matching`, and each looks like this:

```json
"job_matching": {
  "mode": "real",
  "provider": "anthropic",
  "model": "claude-sonnet-5-5",
  "max_tokens": 16000,
  "effort": "medium"
}
```

- **Back to simulated:** change `"mode": "real"` to `"mode": "simulated"` in a step's section. You can switch each step separately. With both simulated, no API key is needed and nothing costs money.
- **Web search or the sample list:** in `job_matching`, `"role_source": "web_search"` makes the AI search the web for real roles. `"sample_list"` makes it rank the fixed sample roles in `simulated_responses.json` instead: 5 internships and 5 full-time roles. The sample list is faster, cheaper, and gives the same roles every time, which helps in class.
- **How much the agent may search:** `max_searches` (default 10) and `max_page_reads` (default 8). More means more roles found, but it's slower and costs more.
- **Another Claude model:** change `"model"`, e.g. `"claude-opus-5-5"` (smarter, slower, pricier) or `"claude-haiku-5-5"` (fastest, cheapest).
- **Thinking effort:** `"low"`, `"medium"`, or `"high"`. Higher effort is slower but more careful.

Save the file. You don't need to restart, because changes apply to the next AI request. Click **Reset demo** in the prototype's bottom bar so the search runs again. (Changes to `.env`, like a new key, do need a restart: **Ctrl+C**, then `npm start`.)

Both steps use the same single function, `callModel()`, in `backend/ai.js`. To try a different AI company, you'd add a branch there for the new `"provider"`.

---

## The test log

Every AI request and every feedback click is saved to **`logs/ai_log.jsonl`**, one line per event. To see it:

```bash
npm run log
```
This shows a short, readable summary of the last 20 events. For the full details of the last 5 events, including the complete instructions and inputs:
```bash
npm run log -- full
```
You can also open `logs/ai_log.jsonl` in any text editor.

What gets recorded:

| Event | What's in it |
|---|---|
| `ai_request` (step `resume_parsing`) | `request_id`, mode, provider, model; **input**: the instructions, the resume*, the profile form values; **output**: the candidate's name and each fact with its `confidence` and source (resume or form); token usage, time taken; or the **error** |
| `ai_request` (step `job_search`) | The agent part of job matching. **input**: the instructions, the resume*, today's date, the preferences; **agent_steps**: every step in order, with the tool used (`web_search`, `web_fetch`, or `code_execution` when the model filters results with code), what it sent (the search query, the URL, or the code) and what came back (result titles and URLs, page read or error); **output**: the AI's written report of the roles it found, with links; usage includes the number of searches and page reads |
| `ai_request` (step `job_matching`) | `request_id`, mode, provider, model; **input**: the instructions (system prompt), the resume*, the candidate preferences, the list of roles; **output**: the ranked roles with `interview_chance`, `confidence`, strengths, gaps and per-requirement status and evidence; token usage, time taken; or the **error** if it failed |
| `user_feedback` | Clicks on the existing feedback buttons. On the profile screen: **Confirm** (accept), **Edit** (correct; logs the before and after text), **Delete** (reject), **Undo**, **Confirm all remaining**. On job recs: **I qualify / I don't qualify / Not sure** (`eligibility_label`), **Override** (`eligibility_override`), **Reset to Landed's result**, **Skip** with reason (reject), **Prepare application** (accept), **Restore**, **It's relevant to me, show it** (`relevance_override`: the AI said not relevant, the user disagreed), plus the accept/edit/revert and rating buttons in later steps. Each one records which AI step it belongs to and the `ai_request_id` of the answer it responds to. |

\*An uploaded PDF is logged as its file name and size, not the whole file. The example resume is logged in full.

The log stays on your laptop, and `.gitignore` keeps it out of git. It may contain resume content, so don't share it carelessly. To start fresh, delete the `logs` folder.

Only the job search is an agent (it chooses its own searches and pages to read), so only `job_search` entries have `agent_steps`. In the readable view (`npm run log`), each step shows as one line.

---

## Troubleshooting

- **"No API key found"** in the yellow banner or the log: `.env` is missing, misnamed (it must be exactly `.env`, not `.env.txt`), or still has `paste-your-key-here`. Fix it, then restart with `npm start`.
- **"authentication_error" / 401:** the key was mistyped or revoked. Create a new one.
- **Credit / billing error:** add credit in the Anthropic Console.
- **"Port 5173 is already in use":** another copy is still running. Close the other Terminal window, or change `PORT` in `.env`.
- **The page says it can't load simulated_responses.json:** open http://localhost:5173 in the browser rather than double-clicking `index.html`.
- If the AI call fails, the prototype shows a banner and falls back to simulated results, so a demo never gets stuck.

## What's where

| File | What it does |
|---|---|
| `config.json` | Provider, model, real/simulated switch |
| `.env.example` | Template for your API key (copy to `.env`) |
| `backend/server.js` | Small local server: shows the prototype and passes requests to the AI |
| `backend/ai.js` | `callModel()` (the one AI call, also used by the search agent), `parseResume()` and `matchJobs()` (each step's instructions, inputs, output format), and logging |
| `backend/logger.js` | Writes `logs/ai_log.jsonl` |
| `backend/sample_resume.txt` | Resume used by the "Fill with example" button (the AI reads this one too) |
| `scripts/show-log.js` | `npm run log` |
| `index.html`, `app.js`, `styles.css` | The prototype itself |
| `simulated_responses.json` | Canned answers for all simulated steps, plus the fixed sample roles (`roles` = internships, `fulltime_roles` = full-time) |

State persists in the browser. Use **Reset demo** in the bottom bar to start over. Settings shows the in-browser activity log.

## Deploying on Vercel
The `api/` folder wraps the same backend code as Vercel serverless functions (`vercel.json` sets a 300 s limit for the web search). In Vercel: Project Settings > Environment Variables, add `ANTHROPIC_API_KEY` (all environments), then redeploy. Logs go to Vercel's function logs instead of `logs/`. Vercel limits request bodies to about 4.5 MB, so very large PDFs will fail.
