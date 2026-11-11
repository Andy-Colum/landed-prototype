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
5. Open Acme Fintech, answer **I qualify** on "Strong product sense", **Prepare application**.
6. Review resume/cover letter (accept/edit/revert, Source tags, regenerate), **Save and continue**.
7. Fill the two yellow fields, **Approve & Submit**.
8. Applications tab: demo bar **Fast-forward 2 weeks**, answer the prompt with "Yes, interview", pick a date.
9. Interview prep: practice an answer, **Simulate: interview finished**, write a reflection, rate it.
10. Applications tab: **Mark outcome… > Offer**, then **Accept offer**.

State persists in localStorage; use **Reset demo** in the bottom bar. Settings shows the activity log (captured data).
