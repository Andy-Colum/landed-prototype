# Landed prototype

Static web app, no backend. All simulated AI output is in `simulated_responses.json`.

## Launch
```
python -m http.server 5173
```
Open http://localhost:5173 (do not open index.html directly; the JSON is loaded with fetch).

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

State persists in localStorage; use **Reset demo** in the bottom bar. Settings shows the activity log (captured data).
