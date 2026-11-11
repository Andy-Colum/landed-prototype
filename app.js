/* Landed prototype. Plain JS, no backend. All simulated AI output comes from simulated_responses.json. */
const KEY = 'landed_proto_v1';
let D, S;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (t, v) => String(t ?? '').replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

const fresh = () => ({
  screen: 'welcome', tab: 'recs', view: null,
  profile: { targetRoles: '', industries: '', locations: '', gradDate: '', workAuth: '', resumeName: '' },
  facts: [], journal: [], draft: { date: '2026-11-10', type: 'project', text: '' },
  shortlist: null, rs: {}, penalties: {}, newRolesFound: false,
  docs: {}, forms: {}, apps: [], interview: null, offer: null,
  paused: false, emailConnected: false, twoWeeks: false, askInterview: null,
  journalPrompt: false, goalNote: '', log: [], editText: '', skipReason: '', skipping: null, editing: null, editFact: null, editJournal: null,
  practice: null, practiceText: '', practiceFb: {}, reflectText: '', rating: 0
});
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
function log(type, data = {}) { S.log.push({ t: new Date().toISOString(), type, ...data }); }
function go(patch) { Object.assign(S, patch); save(); render(); window.scrollTo(0, 0); }
function upd() { save(); render(); }
function toast(m) { const d = document.createElement('div'); d.textContent = m; $('#toast').appendChild(d); setTimeout(() => d.remove(), 3200); }

/* ---------- data helpers ---------- */
const allRoles = () => D.roles.concat(D.new_roles);
const roleById = id => allRoles().find(r => r.id === id);
const rs = id => (S.rs[id] ||= { status: 'new', labels: {} });
const fact = id => S.facts.find(f => f.id === id && f.status === 'confirmed');
const fmtD = iso => iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(2, 4)}` : '';
const fmtLong = iso => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = iso => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace('PM', 'pm').replace('AM', 'am');
function jFind(spec) {
  const c = S.journal.filter(j => j.confirmed).sort((a, b) => b.date.localeCompare(a.date));
  if (spec === 'type:goal') return c.find(j => j.type === 'goal');
  return c.find(j => new RegExp(spec, 'i').test(j.text));
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function parseYM(t) { const m = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})/i.exec(t || ''); return m ? +m[2] * 12 + MONTHS.indexOf(m[1].toLowerCase()) + 1 : null; }
const ymNum = s => +s.slice(0, 4) * 12 + +s.slice(5, 7);
function lev(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = Array.from({ length: n + 1 }, (_, i) => i); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }

/* ---------- simulated eligibility (rules for dates/GPA/work auth, keyword matching, vague => unsure) ---------- */
function autoEval(req) {
  const T = D.eligibility_templates;
  switch (req.kind) {
    case 'gradRange': {
      const f = fact('grad'); const ym = f && parseYM(f.text);
      if (!ym) return { s: 'unsure', r: T.gradRange.missing };
      const ok = ym >= ymNum(req.from) && ym <= ymNum(req.to);
      return { s: ok ? 'meets' : 'not', r: fill(T.gradRange[ok ? 'meets' : 'not'], { value: f.text, from: req.fromLabel, to: req.toLabel }) };
    }
    case 'workAuth': {
      const f = fact('auth');
      if (!f) return { s: 'unsure', r: T.workAuth.missing };
      const ok = /citizen|permanent resident|green card|authorized/i.test(f.text) && !/\bnot\b|need|require|sponsor/i.test(f.text);
      return { s: ok ? 'meets' : 'not', r: fill(T.workAuth[ok ? 'meets' : 'not'], { value: f.text }) };
    }
    case 'minYears': {
      const f = fact('exp1'); const m = f && /(\d+)\s*years?/i.exec(f.text);
      if (!m) return { s: 'unsure', r: T.minYears.missing };
      const years = +m[1], ok = years >= req.years;
      const emp = (/,\s*([^(]+?)\s*\(/.exec(f.text) || [])[1] || 'your last role';
      return { s: ok ? 'meets' : 'not', r: fill(T.minYears[ok ? 'meets' : 'not'], { years, need: req.years, employer: emp }) };
    }
    case 'keyword': {
      const j = jFind(req.keyword);
      if (j) return { s: 'meets', r: fill(T.keyword.journal, { keyword: req.keyword, date: fmtD(j.date), snippet: j.text }) };
      const f = S.facts.find(x => x.status === 'confirmed' && new RegExp('\\b' + req.keyword + '\\b', 'i').test(x.text));
      if (f) return { s: 'meets', r: fill(T.keyword.resume, { keyword: req.keyword, category: f.category }) };
      return { s: 'unsure', r: fill(T.keyword.missing, { keyword: req.keyword }) };
    }
    default: return { s: 'unsure', r: T.judgment.unsure };
  }
}
function evalReq(role, req) {
  const a = autoEval(req), L = rs(role.id).labels[req.id];
  if (!L) return { ...a, user: false, auto: a };
  if (L.v === 'meets') return { s: 'meets', r: 'You confirmed that you meet this requirement.', user: true, auto: a };
  if (L.v === 'not') return { s: 'not', r: "You said you don't meet this requirement.", user: true, auto: a };
  return { s: 'unsure', r: "You said you're not sure. It stays flagged and is never silently included or dropped.", user: true, auto: a };
}
function overall(role) {
  const res = role.requirements.map(q => evalReq(role, q).s);
  return res.includes('not') ? 'not' : res.includes('unsure') ? 'input' : 'eligible';
}
const BADGE = { eligible: ['Eligible', 'b-eligible'], input: ['Needs your input', 'b-input'], not: ['Not eligible', 'b-not'] };
function score(role) {
  let s = role.interviewChance; const g = jFind('type:goal');
  if (g) {
    if (/fintech/i.test(g.text) && role.tags.includes('fintech')) s += .05;
    if (/\bSF\b|San Francisco/i.test(g.text) && role.tags.includes('sf')) s += .03;
    if (/NYC|New York/i.test(g.text) && role.tags.includes('nyc')) s += .03;
  }
  role.tags.forEach(t => s -= (S.penalties[t] || 0));
  return s;
}
function ranked() {
  return (S.shortlist || []).map(roleById).filter(r => ['new', 'approved', 'applied'].includes(rs(r.id).status))
    .sort((a, b) => ((overall(a) === 'not') - (overall(b) === 'not')) || (score(b) - score(a)));
}

/* ---------- render ---------- */
function render() {
  if (window._ov) { clearInterval(window._ov); window._ov = null; }
  const el = $('#app');
  if (S.screen === 'welcome') el.innerHTML = vWelcome();
  else if (S.screen === 'onboarding') el.innerHTML = vOnboarding();
  else if (S.screen === 'parsing') el.innerHTML = `<div class="center card"><h2>Reading your resume…</h2><p class="mute">Parsing ${esc(S.profile.resumeName)} into structured facts.</p><div class="spin"></div></div>`;
  else if (S.screen === 'verify') el.innerHTML = vVerify();
  else el.innerHTML = vApp();
  $('#demobar').innerHTML = vDemo();
  if (S.screen === 'app' && S.view?.name === 'overnight' && S.view.phase === 'run') runOvernight();
}
const vDemo = () => `<b>Demo controls</b>
  <button class="btn" data-act="startOvernight" ${S.screen !== 'app' || S.shortlist ? 'disabled' : ''}>⏩ Overnight search → 7:00 am</button>
  <button class="btn" data-act="ffTwoWeeks" ${S.twoWeeks || !S.apps.length ? 'disabled' : ''}>⏩ Fast-forward 2 weeks</button>
  <button class="btn" data-act="reset">Reset demo</button>`;

function vWelcome() {
  return `<div class="center card" style="text-align:center"><div class="logo">Landed<i></i></div>
  <p class="mute small" style="margin:2px 0 18px">An AI job application agent, offered by</p>
  <h2>${esc(D.school.office)}</h2><p>${esc(D.school.name)}</p>
  <p class="mute">Find the roles you actually qualify for, send honest tailored applications, and get better at interviews.</p>
  <button class="btn pri" data-act="signin">Sign in with school account</button></div>`;
}
function vOnboarding() {
  const p = S.profile, inp = (k, label, ph) => `<div><label>${label}</label><input type="text" data-bind="profile.${k}" value="${esc(p[k])}" placeholder="${ph}"></div>`;
  return `<div class="wrap"><div class="logo">Landed<i></i></div><div class="card" style="margin-top:14px"><h2>Set up your profile</h2>
  <p class="mute small">Signed in as ${esc(D.sample_profile.name)} · ${esc(D.school.office)}</p>
  <label>Resume (PDF)</label>
  <div class="card flat" style="border-style:dashed;text-align:center">${p.resumeName ? `📄 <b>${esc(p.resumeName)}</b>` : 'Drop your resume here, or choose a file'}<br>
  <input type="file" id="resume" accept="application/pdf,.pdf" style="margin-top:8px"></div>
  <div class="grid2">${inp('targetRoles', 'Target roles', 'e.g. Product Management')}${inp('industries', 'Industries', 'e.g. Fintech')}
  ${inp('locations', 'Locations', 'e.g. San Francisco or NYC')}${inp('gradDate', 'Graduation date', 'e.g. June 2028')}${inp('workAuth', 'Work authorization', 'e.g. US citizen')}</div>
  <div class="row" style="margin-top:16px"><button class="btn pri" data-act="submitProfile">Continue</button><button class="btn ghost" data-act="fillExample">Fill with example (Priya Shah)</button></div></div></div>`;
}
function vVerify() {
  let last = '', h = '';
  S.facts.forEach(f => {
    if (f.category !== last) { h += `<div class="cat" style="margin-top:14px">${esc(f.category.replace(/ \(.*\)/, ''))}</div>`; last = f.category; }
    const ed = S.editFact === f.id;
    h += `<div class="fact ${f.status === 'deleted' ? 'del' : ''}"><div style="flex:1;min-width:240px">${ed ? `<input type="text" data-bind="editText" value="${esc(S.editText)}">` : esc(f.text)}
    ${f.status === 'confirmed' ? ' <span class="badge b-eligible">Confirmed</span>' : f.status === 'deleted' ? ' <span class="badge b-gray">Deleted</span>' : ' <span class="badge b-input">Pending</span>'}</div>
    <div class="row">${ed ? `<button class="btn sm pri" data-act="saveFact" data-id="${f.id}">Save</button><button class="btn sm" data-act="cancelFact">Cancel</button>`
      : f.status === 'deleted' ? `<button class="btn sm" data-act="undoFact" data-id="${f.id}">Undo</button>`
      : `<button class="btn sm go" data-act="confirmFact" data-id="${f.id}">Confirm</button><button class="btn sm" data-act="editFact" data-id="${f.id}">Edit</button><button class="btn sm" data-act="deleteFact" data-id="${f.id}">Delete</button>`}</div></div>`;
  });
  const pending = S.facts.filter(f => f.status === 'pending').length;
  return `<div class="wrap"><div class="logo">Landed<i></i></div><div class="card" style="margin-top:14px"><h2>Verify your profile</h2>
  <div class="notice">Landed only uses facts you confirm. Confirm, edit, or delete each one below.</div>${h}
  <div class="row" style="margin-top:16px"><button class="btn pri" data-act="finishVerify" ${pending ? 'disabled' : ''}>Save verified profile</button>
  <button class="btn ghost" data-act="confirmAll">Confirm all remaining</button><span class="mute small">${pending ? pending + ' fact(s) still pending' : 'All facts reviewed'}</span></div></div></div>`;
}

function vApp() {
  const tabs = [['recs', 'Job recs'], ['tracker', 'Applications'], ['journal', 'Career journal'], ['settings', 'Settings']];
  let body;
  const v = S.view;
  if (v && v.name === 'overnight') body = vOvernight();
  else if (v && v.name === 'role') body = vRole(roleById(v.roleId));
  else if (v && v.name === 'tailor') body = vTailor(roleById(v.roleId));
  else if (v && v.name === 'form') body = vForm(roleById(v.roleId));
  else if (v && v.name === 'submitted') body = vSubmitted(roleById(v.roleId));
  else if (v && v.name === 'prep') body = vPrep();
  else if (v && v.name === 'offer') body = vOffer();
  else body = { recs: vRecs, tracker: vTracker, journal: vJournal, settings: vSettings }[S.tab]();
  return `<div class="top"><div class="logo" style="font-size:24px">Landed<i></i></div><small>${esc(D.school.office)} · ${esc(D.sample_profile.name)}</small></div>
  <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${S.tab === k && !S.view ? 'on' : ''}" data-act="tab" data-id="${k}">${l}</button>`).join('')}</div>
  <div class="wrap">${body}</div>`;
}
const back = (l = '← Back to shortlist') => `<p><button class="btn sm ghost" data-act="home">${l}</button></p>`;

/* ----- Job recs ----- */
function reqList(role, interactive) {
  return role.requirements.map(q => {
    const e = evalReq(role, q), icon = { meets: ['✓', 'meets'], not: ['✗', 'not'], unsure: ['?', 'unsure'] }[e.s];
    let extra = '';
    if (interactive) {
      const btn = (v, l) => `<button class="btn sm" data-act="label" data-role="${role.id}" data-req="${q.id}" data-v="${v}" data-kind="label">${l}</button>`;
      if (e.s === 'unsure') extra = `<div class="unsure-box">${q.postingText ? `<div class="small mute">Exact posting text</div><div class="quote">${esc(q.postingText)}</div>` : ''}
        <div class="small"><b>What Landed compared it to:</b> ${esc(q.comparedTo || e.r)}</div><div style="margin:8px 0 6px"><b>Do you meet this requirement?</b></div>
        <div class="row">${btn('meets', 'I qualify')}${btn('not', "I don't qualify")}${btn('notsure', 'Not sure')}</div></div>`;
      else extra = `<details class="small"><summary class="mute" style="cursor:pointer">${e.user ? 'You labeled this' : 'Disagree?'} Override</summary><div class="row" style="margin-top:4px">
        <button class="btn sm" data-act="label" data-role="${role.id}" data-req="${q.id}" data-v="meets" data-kind="override">I do meet this</button>
        <button class="btn sm" data-act="label" data-role="${role.id}" data-req="${q.id}" data-v="not" data-kind="override">I don't meet this</button>
        ${e.user ? `<button class="btn sm ghost" data-act="clearLabel" data-role="${role.id}" data-req="${q.id}">Reset to Landed's result</button>` : ''}</div></details>`;
    }
    return `<div class="req"><div class="ic ${icon[1]}">${icon[0]}</div><div style="flex:1"><b>${esc(q.text)}</b><div class="small mute">${esc(e.r)}</div>${extra}</div></div>`;
  }).join('');
}
function roleCard(role, rank) {
  const o = overall(role), st = rs(role.id).status, b = BADGE[o];
  return `<div class="card"><div class="row sp"><div class="row"><div class="rank">${rank}</div><div><b style="font-size:17px">${esc(role.shortTitle)}, ${esc(role.company)}</b>
  <div class="small mute">${esc(role.title)} · ${esc(role.location)} · Deadline ${esc(role.deadline)} · ${esc(role.source)}</div></div></div>
  <span class="badge ${st === 'applied' ? 'b-blue' : b[1]}">${st === 'applied' ? 'Applied' : b[0]}</span></div>
  <div style="margin-top:6px">${reqList(role, false)}</div>
  ${S.skipping === role.id ? `<div class="unsure-box"><b>Skip this role?</b> <span class="small mute">Reason is optional and helps adjust future rankings.</span>
    <select data-bind="skipReason"><option value="">No reason</option><option>Not interested in this company</option><option>Wrong location</option><option>Wrong type of role</option><option>Timing doesn't work</option></select>
    <div class="row" style="margin-top:8px"><button class="btn sm pri" data-act="confirmSkip" data-id="${role.id}">Confirm skip</button><button class="btn sm" data-act="cancelSkip">Cancel</button></div></div>`
  : `<div class="row" style="margin-top:8px"><button class="btn sm" data-act="openRole" data-id="${role.id}">Open</button>
    ${st === 'applied' ? '' : `<button class="btn sm pri" data-act="prepare" data-id="${role.id}" ${o === 'not' ? 'disabled' : ''}>Prepare application</button><button class="btn sm" data-act="skip" data-id="${role.id}">Skip</button>`}</div>`}</div>`;
}
function vRecs() {
  if (S.paused) return `<div class="good"><b>Your search is paused.</b> Daily shortlists are off. <button class="btn sm" data-act="resumeSearch">Resume search</button></div>`;
  if (!S.shortlist) return `<div class="card"><h2>Top roles for you</h2><p class="mute">No shortlist yet. Landed checks new postings overnight and has your shortlist ready by 7:00 am.</p>
    <button class="btn pri" data-act="startOvernight">Simulate the overnight search</button></div>`;
  const list = ranked(), skipped = S.shortlist.map(roleById).filter(r => rs(r.id).status === 'skipped'), removed = S.shortlist.map(roleById).filter(r => rs(r.id).status === 'removed');
  return `<div class="row sp"><div><h2>Top roles for you</h2><div class="mute small">${esc(D.search.shortlistDate)} · ranked by predicted chance of an interview</div></div>
  <button class="btn pri" data-act="findNow" ${S.searching ? 'disabled' : ''}>${S.searching ? 'Searching…' : 'Find new roles now'}</button></div><div style="height:12px"></div>
  ${S.searching ? '<div class="card"><div class="spin"></div><p style="text-align:center" class="mute">Searching the career portal and company sites…</p></div>' : ''}
  ${list.map((r, i) => roleCard(r, i + 1)).join('')}
  ${removed.length ? `<div class="card flat"><b>Removed (${removed.length})</b>${removed.map(r => `<div class="small" style="margin-top:6px">${esc(r.shortTitle)}, ${esc(r.company)}: ${esc(rs(r.id).removedReason)} <button class="btn sm ghost" data-act="restore" data-id="${r.id}">Restore</button></div>`).join('')}</div>` : ''}
  ${skipped.length ? `<div class="card flat"><b>Skipped (${skipped.length})</b>${skipped.map(r => `<div class="small mute" style="margin-top:6px">${esc(r.shortTitle)}, ${esc(r.company)}${rs(r.id).skipReason ? ' · ' + esc(rs(r.id).skipReason) : ''} (similar roles will rank lower)</div>`).join('')}</div>` : ''}`;
}
function vRole(role) {
  const o = overall(role), b = BADGE[o], st = rs(role.id).status;
  return `${back()}<div class="card"><div class="row sp"><div><h2>${esc(role.title)}</h2><div class="mute">${esc(role.company)} · ${esc(role.location)} · Deadline ${esc(role.deadline)} · ${esc(role.source)}</div></div><span class="badge ${b[1]}">${b[0]}</span></div>
  <h3 style="margin-top:14px">Requirements</h3>${reqList(role, true)}
  <div class="row" style="margin-top:12px">${st === 'applied' ? '' : `<button class="btn pri" data-act="prepare" data-id="${role.id}" ${o === 'not' ? 'disabled' : ''}>Prepare application</button><button class="btn" data-act="skip" data-id="${role.id}">Skip</button>`}
  ${o === 'input' ? '<span class="small mute">Resolve the flagged requirement first. Landed never silently includes or drops unsure roles.</span>' : ''}
  ${o === 'not' ? '<span class="small mute">You can still override a result above if Landed got it wrong.</span>' : ''}</div></div>`;
}
function vOvernight() {
  const done = S.view.phase === 'done';
  return `<div class="night"><h2 style="color:#fff">${done ? 'Good morning ☀️' : 'Landed is working while you sleep 🌙'}</h2>
  <div class="panel"><b>Checking <span id="ovn">${done ? D.search.totalRoles : 0}</span> of ${D.search.totalRoles} roles</b><div class="bar" style="margin:8px 0"><div id="ovbar" style="width:${done ? 100 : 0}%"></div></div>
  <div id="ovlist">${done ? D.search.scan.map(s => scanRow(s)).join('') : ''}</div>
  ${done ? '' : '<button class="btn sm" style="margin-top:10px" data-act="skipOvernight">Skip ahead to 7:00 am</button>'}</div>
  ${done ? `<div class="notif" data-act="openShortlist"><div class="small mute">Landed · 7:00 am</div><b>Your shortlist is ready</b><div class="small">${ranked().length} ranked roles are waiting. Tap to open.</div></div>` : ''}</div>`;
}
const scanRow = s => `<div class="scan"><span>${esc(s.label)}</span><b style="color:${s.ok ? 'var(--green)' : 'var(--red)'}">${s.ok ? '✓' : '✗'}</b></div>`;
function runOvernight() {
  let n = 0, shown = 0; const total = D.search.totalRoles, scan = D.search.scan;
  window._ov = setInterval(() => {
    const bar = $('#ovbar'); if (!bar) { clearInterval(window._ov); window._ov = null; return; }
    n = Math.min(total, n + Math.ceil(total / 40)); const pct = n / total;
    bar.style.width = pct * 100 + '%'; $('#ovn').textContent = n;
    const want = Math.floor(pct * scan.length); while (shown < want) { $('#ovlist').insertAdjacentHTML('beforeend', scanRow(scan[shown])); shown++; }
    if (n >= total) { clearInterval(window._ov); window._ov = null; finishOvernight(); }
  }, 200);
}
function finishOvernight() {
  S.shortlist = D.roles.map(r => r.id);
  log('shortlist_generated', { roles: ranked().map((r, i) => ({ id: r.id, rank: i + 1, eligibility: overall(r), requirements: r.requirements.map(q => ({ id: q.id, result: evalReq(r, q).s })) })) });
  go({ view: { name: 'overnight', phase: 'done' }, tab: 'recs' });
}

/* ----- Tailoring ----- */
function resolveSources(srcs) {
  return srcs.map(s => {
    if (s.fact) { const f = fact(s.fact); return f ? { label: s.label, text: f.text } : null; }
    if (s.journal) { const j = jFind(s.journal); return j ? { label: `Journal, ${fmtD(j.date)}`, text: j.text } : null; }
    return { label: s.label, text: s.text };
  }).filter(Boolean);
}
function buildLetter(role, v) {
  const cl = D.tailoring.cover_letter, ov = v > 0 ? cl.variants[(v - 1) % cl.variants.length] : {};
  return cl.base.map(l => { const sources = resolveSources(l.sources); if (!sources.length) return null; const t = fill(ov[l.id] || l.text, { company: role.company, role: role.title }); return { id: l.id, original: null, gen: t, text: t, state: 'pending', sources }; }).filter(Boolean);
}
function ensureDocs(role) {
  if (S.docs[role.id]) return;
  const resume = D.tailoring.resume.map(l => { const sources = resolveSources(l.sources); if (!sources.length) return null; const t = fill(l.tailored, { company: role.company }); return { id: l.id, section: l.section, original: l.original, gen: t, text: t, state: 'pending', sources }; }).filter(Boolean);
  S.docs[role.id] = { resume, letter: buildLetter(role, 0), variant: 0, tab: 'resume' };
  log('documents_generated', { role: role.id, resumeLines: resume.length });
}
function hl(orig, text) {
  const set = new Set((orig || '').toLowerCase().split(/\s+/).map(w => w.replace(/\W/g, '')));
  return text.split(/\s+/).map(w => !orig || set.has(w.toLowerCase().replace(/\W/g, '')) ? esc(w) : `<mark>${esc(w)}</mark>`).join(' ');
}
function editStats(docs) {
  let ch = 0, base = 0;
  ['resume', 'letter'].forEach(k => docs[k].forEach(l => {
    base += l.gen.length;
    if (l.state === 'removed') ch += l.gen.length; else if (l.text !== l.gen) ch += lev(l.gen, l.text);
  }));
  return { editedChars: ch, totalChars: base, pct: base ? Math.round(ch / base * 100) : 0 };
}
function lineHtml(kind, l) {
  const key = kind + ':' + l.id, ed = S.editing === key, side = kind === 'resume';
  const txt = ed ? `<textarea data-bind="editText">${esc(S.editText)}</textarea>` : `<div class="txt">${side ? hl(l.original, l.text) : esc(l.text)}</div>`;
  const stateB = { pending: '', accepted: '<span class="badge b-eligible">Accepted</span>', edited: '<span class="badge b-blue">Edited by you</span>', reverted: '<span class="badge b-gray">Reverted</span>', removed: '<span class="badge b-gray">Removed</span>' }[l.state];
  const d = `data-doc="${kind}" data-lid="${l.id}"`;
  return `<div class="line ${l.state === 'removed' ? 'removed' : ''}">${side ? `<div class="cols"><div><div class="cat">Original</div>${l.original ? esc(l.original) : '<span class="mute">(not on your resume)</span>'}</div><div><div class="cat">Tailored${l.text !== l.original ? ' · changed' : ''}</div>${txt}</div></div>` : txt}
  <div class="row small" style="margin-top:6px">${l.sources.map((s, i) => `<span class="tag" data-act="src" data-key="${key}" data-i="${i}">Source: ${esc(s.label)}</span>`).join('')} ${stateB}</div>
  ${(S.srcOpen || {})[key] != null ? `<div class="srctext">${esc(l.sources[S.srcOpen[key]].text)}</div>` : ''}
  <div class="row" style="margin-top:6px">${ed ? `<button class="btn sm pri" data-act="lineSave" ${d}>Save</button><button class="btn sm" data-act="lineCancel">Cancel</button>`
    : `<button class="btn sm go" data-act="lineAccept" ${d}>Accept</button><button class="btn sm" data-act="lineEdit" ${d}>Edit</button><button class="btn sm" data-act="lineRevert" ${d}>Revert</button>`}</div></div>`;
}
function vTailor(role) {
  ensureDocs(role); const d = S.docs[role.id], tab = d.tab;
  let h = '';
  if (tab === 'resume') { let sec = ''; d.resume.forEach(l => { if (l.section !== sec) { h += `<h3 style="margin-top:12px">${esc(l.section)}</h3>`; sec = l.section; } h += lineHtml('resume', l); }); }
  else h = d.letter.map(l => lineHtml('letter', l)).join('') + `<div class="row" style="margin-top:12px"><button class="btn" data-act="regen">↻ Regenerate cover letter</button><span class="small mute">Draft ${d.variant + 1}</span></div>`;
  return `${back()}<div class="card"><h2>Tailored documents for ${esc(role.title)}, ${esc(role.company)}</h2><div class="small mute">Landed used only your confirmed resume facts and journal entries. Click a Source tag to see the exact source.</div>
  <div class="row" style="margin:12px 0"><button class="tab ${tab === 'resume' ? 'on' : ''}" data-act="docTab" data-id="resume">Resume</button><button class="tab ${tab === 'letter' ? 'on' : ''}" data-act="docTab" data-id="letter">Cover letter</button></div>${h}
  <div class="row" style="margin-top:16px"><button class="btn pri" data-act="saveDocs">Save and continue to application form</button></div></div>`;
}

/* ----- Form ----- */
function ensureForm(role) {
  if (S.forms[role.id]) return;
  const slug = role.company.replace(/\W+/g, ''), values = {}, flagged = [];
  D.form.fields.forEach(f => {
    let v = f.flagged ? '' : f.fact ? (fact(f.fact)?.text ?? '') : fill(f.value, { slug, location: role.location });
    values[f.id] = v; if (!v) flagged.push(f.id);
  });
  S.forms[role.id] = { values, orig: { ...values }, flagged, total: D.form.fields.length, filled: D.form.fields.length - flagged.length };
}
function vForm(role) {
  ensureForm(role); const F = S.forms[role.id];
  const fields = D.form.fields.map(f => {
    const v = F.values[f.id], need = F.flagged.includes(f.id) && !v;
    const bind = `data-bind="forms.${role.id}.values.${f.id}"`;
    const input = f.input === 'select' ? `<select ${bind}><option value="">Select…</option>${f.options.map(o => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
      : f.input === 'date' ? `<input type="date" ${bind} value="${esc(v)}">` : `<input type="text" ${bind} value="${esc(v)}">`;
    return `<div class="${need ? 'flag' : ''}"><label style="margin-top:0">${esc(f.label)} ${need ? '<span class="badge b-input">Needs your input</span>' : F.flagged.includes(f.id) ? '<span class="badge b-blue">Completed by you</span>' : ''}</label>${input}</div>`;
  }).join('');
  return `${back()}<div class="card"><div class="row sp"><h2>${esc(role.company)} application form</h2><span class="badge b-gray">${F.filled} of ${F.total} fields filled by Landed</span></div>
  <p class="mute small">Landed flags fields it's unsure about instead of guessing. Nothing is sent until you click Approve &amp; Submit.</p><div class="grid2">${fields}</div>
  <div class="row" style="margin-top:16px"><button class="btn go" data-act="submitApp" data-id="${role.id}">Approve &amp; Submit</button><button class="btn" data-act="cancelApp" data-id="${role.id}">Cancel</button></div></div>`;
}
function vSubmitted(role) {
  return `<div class="card" style="text-align:center"><h2>✅ Application submitted to ${esc(role.company)}</h2><p class="mute">It's been added to your tracker.</p>
  <div class="row" style="justify-content:center"><button class="btn pri" data-act="tab" data-id="tracker">View tracker</button><button class="btn" data-act="home">Back to shortlist</button></div></div>`;
}

/* ----- Tracker ----- */
function vTracker() {
  const due = S.twoWeeks ? S.apps.filter(a => a.status === 'Submitted') : [];
  const prompts = due.map(a => `<div class="notice"><b>Did you hear back from ${esc(a.company)}?</b> It's been two weeks.
    <div class="row" style="margin-top:6px"><button class="btn sm" data-act="mark" data-id="${a.id}" data-v="Interview" data-via="prompt">Yes, interview</button><button class="btn sm" data-act="mark" data-id="${a.id}" data-v="Rejected" data-via="prompt">Rejected</button><button class="btn sm" data-act="mark" data-id="${a.id}" data-v="No reply" data-via="prompt">No reply</button></div></div>`).join('');
  const ask = S.askInterview ? `<div class="card"><h3>When is your ${esc(S.apps.find(a => a.id === S.askInterview).company)} interview?</h3><input type="datetime-local" data-bind="interviewDT" value="${esc(S.interviewDT || '2026-12-03T14:00')}" style="max-width:260px">
    <div class="row" style="margin-top:8px"><button class="btn pri" data-act="saveInterview">Save and create interview prep</button><button class="btn" data-act="cancelInterview">Cancel</button></div></div>` : '';
  const cls = { Submitted: 'b-blue', Interview: 'b-input', Rejected: 'b-not', 'No reply': 'b-gray', Offer: 'b-eligible' };
  return `<div class="row sp"><h2>Applications</h2>${S.emailConnected ? '<span class="badge b-eligible">Email connected (simulated)</span>' : '<button class="btn" data-act="connectEmail">Connect email</button>'}</div>
  <p class="small mute">${S.emailConnected ? 'Landed will detect replies automatically. You can still mark outcomes yourself.' : 'Optional: connect email so Landed can detect outcomes automatically.'}</p>${prompts}${ask}
  <div class="card">${S.apps.length ? `<table><tr><th>Company</th><th>Role</th><th>Submitted</th><th>Status</th><th>Update</th></tr>${S.apps.map(a => `<tr><td><b>${esc(a.company)}</b></td><td>${esc(a.title)}</td><td>${fmtLong(a.submittedAt)}</td>
  <td><span class="badge ${cls[a.status]}">${a.status}</span>${a.status === 'Offer' && S.offer?.decision === 'accepted' ? ' <span class="badge b-eligible">Accepted</span>' : ''}</td>
  <td>${a.status === 'Interview' ? `<button class="btn sm" data-act="openPrep">Interview prep</button> ` : ''}${a.status === 'Offer' ? `<button class="btn sm" data-act="openOffer">View offer</button> ` : ''}
  <select data-change="mark" data-id="${a.id}" style="width:auto"><option value="">Mark outcome…</option>${['Interview', 'Offer', 'Rejected', 'No reply'].map(o => `<option>${o}</option>`).join('')}</select></td></tr>`).join('')}</table>` : '<p class="mute">No applications yet. Prepare and approve one from your shortlist.</p>'}</div>`;
}

/* ----- Interview prep ----- */
function storyFor(q) {
  for (const s of q.stories) {
    if (s.journal) { const j = jFind(s.journal); if (j) return { label: s.label, detail: j.text, source: `Journal, ${fmtD(j.date)}` }; }
    else if (!s.fact || fact(s.fact)) return s;
  }
  return null;
}
function vPrep() {
  const iv = S.interview, app = S.apps.find(a => a.id === iv.appId), I = D.interview;
  const qs = I.questions.map((q, i) => {
    const st = storyFor(q), open = S.practice === i, fb = S.practiceFb[i];
    return `<div class="line"><b>${esc(q.q)}</b><div class="small" style="margin:3px 0">${st ? `💡 Suggested story: <b>${esc(st.label)}</b> <span class="tag">Source: ${esc(st.source)}</span><div class="mute">${esc(st.detail)}</div>` : '<span class="mute">No matching story yet. Add one to your career journal.</span>'}</div>
    ${open ? `<textarea data-bind="practiceText" placeholder="Type your answer…">${esc(S.practiceText)}</textarea><div class="row" style="margin-top:6px"><button class="btn sm pri" data-act="getPractice" data-i="${i}">Get feedback</button><button class="btn sm" data-act="closePractice">Close</button></div>`
      : `<button class="btn sm pri" data-act="practice" data-i="${i}">Practice answer</button>`}
    ${fb ? `<div class="good small"><b>Feedback:</b> ${esc(fb.text)}<div class="row" style="margin-top:4px">${fb.rating ? `<span class="mute">You rated this: ${fb.rating}</span>` : `<button class="btn sm" data-act="rateFb" data-i="${i}" data-v="Helpful">Helpful</button><button class="btn sm" data-act="rateFb" data-i="${i}" data-v="Not helpful">Not helpful</button>`}</div></div>` : ''}</div>`;
  }).join('');
  const r = iv.reflection;
  const reflect = iv.stage === 'before' ? `<div class="card flat"><b>After the interview</b><p class="small mute">Once your interview is over, come back and reflect.</p><button class="btn" data-act="interviewDone">Simulate: interview finished</button></div>`
    : `<div class="card"><h3>My reflection</h3>${r ? `<div class="line">${esc(r.text)}<div class="small mute">Felt: ${r.rating}/5</div></div><div class="good"><b>Feedback (saved for your next interview):</b> ${esc(r.feedback)}
      <div class="row" style="margin-top:6px">${r.fbRating ? `<span class="mute">You rated this: ${r.fbRating}</span>` : `<button class="btn sm" data-act="rateRefl" data-v="Helpful">Helpful</button><button class="btn sm" data-act="rateRefl" data-v="Not helpful">Not helpful</button>`}</div></div>
      <p class="small mute">When you hear back, mark the outcome in the Applications tab.</p><button class="btn" data-act="tab" data-id="tracker">Go to Applications</button>`
      : `<p class="mute">How did it go? What would you do differently?</p><textarea data-bind="reflectText" placeholder="e.g. I think the case part went well, but I rambled on the metrics question and didn't give a clear number.">${esc(S.reflectText)}</textarea>
      <label>How did the interview feel?</label><div class="stars row">${[1, 2, 3, 4, 5].map(n => `<button class="${S.rating >= n ? 'on' : ''}" data-act="rate" data-v="${n}">${n}</button>`).join('')}</div>
      <div style="margin-top:10px"><button class="btn pri" data-act="submitReflection">Get feedback</button></div>`}</div>`;
  return `<p><button class="btn sm ghost" data-act="tab" data-id="tracker">← Back to Applications</button></p><div class="card"><h2>Interview prep</h2><div class="mute" style="margin-bottom:8px">${esc(app.company)}, ${fmtTime(iv.dt)}</div>
  <h3>Likely questions</h3>${qs}</div>${reflect}`;
}

/* ----- Offer ----- */
function vOffer() {
  const app = S.apps.find(a => a.id === S.offer.appId), role = roleById(app.roleId), acc = S.offer.decision === 'accepted';
  return `<div class="offer"><h2>🎉 ${acc ? 'Offer accepted' : 'Offer received'}</h2><div class="oc"><b>${esc(role.company)}</b><div class="mute small">Offer received</div><hr style="border:0;border-top:1px dashed var(--line)">
  <div><b>${esc(role.shortTitle)}</b></div><div>${esc(role.offerTerms)}, ${esc(role.location)}</div></div>
  ${acc ? `<h3>${esc(D.messages.congrats)}</h3><button class="btn" data-act="tab" data-id="recs">See Job recs</button>`
    : `<div class="row" style="justify-content:center"><button class="btn go" data-act="acceptOffer">Accept offer</button><button class="btn" data-act="stillDeciding">Still deciding</button><button class="btn ghost" data-act="pauseSearch">Pause search</button></div>
    ${S.offer.decision === 'pending' ? '<p class="small mute">Marked as pending. Your shortlists keep running while you decide.</p>' : ''}`}</div>`;
}

/* ----- Career journal ----- */
const TYPES = { project: 'Project', win: 'Win', club: 'Club role', skill: 'Skill', goal: 'Career goal' };
function vJournal() {
  const e = [...S.journal].sort((a, b) => b.date.localeCompare(a.date)), dr = S.draft;
  return `${S.journalPrompt ? '<div class="notice"><b>Add anything your resume doesn\'t show.</b> Projects, wins, club roles, skills, and goals. Confirm each entry so Landed can use it.</div>' : ''}
  <div class="card"><h2>Career journal</h2>
  <div class="grid2"><div><label>Date</label><input type="date" data-bind="draft.date" value="${esc(dr.date)}"></div><div><label>Type</label><select data-bind="draft.type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${dr.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
  <label>Entry</label><textarea data-bind="draft.text" placeholder="What did you do or what do you want?">${esc(dr.text)}</textarea>
  <div class="row" style="margin-top:8px"><button class="btn pri" data-act="addEntry">+ Add entry</button><span class="small mute">Quick examples:</span>
  ${D.journal_examples.map((x, i) => `<button class="btn sm ghost" data-act="example" data-i="${i}">${fmtD(x.date)}</button>`).join('')}</div></div>
  <div class="timeline">${e.length ? e.map(x => `<div class="entry ${x.confirmed ? '' : 'unconf'}"><b>${fmtD(x.date)}</b> <span class="cat">${TYPES[x.type]}</span> ${x.confirmed ? '<span class="badge b-eligible">Confirmed true</span>' : '<span class="badge b-gray">Unconfirmed, not used yet</span>'}
    ${S.editJournal === x.id ? `<textarea data-bind="editText">${esc(S.editText)}</textarea><div class="row"><button class="btn sm pri" data-act="saveEntry" data-id="${x.id}">Save</button><button class="btn sm" data-act="cancelEntry">Cancel</button></div>`
    : `<div>${esc(x.text)}</div><div class="row" style="margin-top:4px">${x.confirmed ? '' : `<button class="btn sm go" data-act="confirmEntry" data-id="${x.id}">Confirm as true</button>`}<button class="btn sm" data-act="editEntry" data-id="${x.id}">Edit</button><button class="btn sm" data-act="deleteEntry" data-id="${x.id}">Delete</button></div>`}</div>`).join('') : '<p class="mute">No entries yet.</p>'}</div>`;
}

/* ----- Settings ----- */
function vSettings() {
  const p = S.profile;
  return `<h2>Settings</h2><div class="card"><h3>Preferences</h3><div class="small">Target roles: <b>${esc(p.targetRoles)}</b> · Industries: <b>${esc(p.industries)}</b> · Locations: <b>${esc(p.locations)}</b></div>
  ${S.goalNote ? `<div class="small" style="margin-top:6px">Updated from your journal goal: <i>${esc(S.goalNote)}</i></div>` : ''}
  <div class="small" style="margin-top:6px">Search: <b>${S.paused ? 'Paused' : 'Active'}</b> ${S.paused ? '<button class="btn sm" data-act="resumeSearch">Resume search</button>' : ''}</div></div>
  <div class="card"><h3>Activity log (data Landed captures)</h3><div class="row"><button class="btn sm" data-act="download">Download as JSON</button><span class="small mute">${S.log.length} events</span></div>
  <div style="max-height:260px;overflow:auto;margin-top:8px">${[...S.log].reverse().slice(0, 80).map(l => `<div class="small" style="border-top:1px dashed var(--line);padding:3px 0"><b>${esc(l.type)}</b> <span class="mute">${esc(l.t.slice(11, 19))}</span> ${esc(JSON.stringify(Object.fromEntries(Object.entries(l).filter(([k]) => k !== 't' && k !== 'type')))).slice(0, 220)}</div>`).join('') || '<span class="mute small">Nothing yet.</span>'}</div></div>`;
}

/* ---------- actions ---------- */
const A = {
  signin() { log('sign_in'); go({ screen: 'onboarding' }); },
  fillExample() { S.profile = { ...D.sample_profile.prefs, resumeName: 'Priya_Shah_Resume.pdf' }; upd(); },
  submitProfile() {
    const p = S.profile; if (!p.resumeName) return toast('Please upload your resume (PDF).');
    if (['targetRoles', 'industries', 'locations', 'gradDate', 'workAuth'].some(k => !p[k].trim())) return toast('Please complete all fields.');
    log('profile_submitted', { ...p }); S.screen = 'parsing'; save(); render();
    setTimeout(() => {
      S.facts = D.parsed_resume_facts.map(f => ({ ...f, status: 'pending', text: f.id === 'grad' ? p.gradDate : f.id === 'auth' ? p.workAuth : f.text }));
      go({ screen: 'verify' });
    }, 1600);
  },
  confirmFact(d) { const f = S.facts.find(x => x.id === d.id); f.status = 'confirmed'; log('fact_confirmed', { id: d.id }); upd(); },
  editFact(d) { S.editFact = d.id; S.editText = S.facts.find(x => x.id === d.id).text; upd(); },
  saveFact(d) { const f = S.facts.find(x => x.id === d.id); if (!S.editText.trim()) return toast('A fact cannot be empty.'); log('fact_edited', { id: d.id, from: f.text, to: S.editText }); f.text = S.editText.trim(); f.status = 'confirmed'; S.editFact = null; upd(); },
  cancelFact() { S.editFact = null; upd(); },
  deleteFact(d) { S.facts.find(x => x.id === d.id).status = 'deleted'; log('fact_deleted', { id: d.id }); upd(); },
  undoFact(d) { S.facts.find(x => x.id === d.id).status = 'pending'; upd(); },
  confirmAll() { S.facts.forEach(f => { if (f.status === 'pending') f.status = 'confirmed'; }); log('facts_confirmed_all'); upd(); },
  finishVerify() { log('profile_verified', { facts: S.facts.filter(f => f.status === 'confirmed').length }); go({ screen: 'app', tab: 'journal', view: null, journalPrompt: true }); },

  tab(d) { go({ tab: d.id, view: null }); },
  home() { go({ tab: 'recs', view: null }); },

  /* journal */
  example(d) { S.draft = { ...D.journal_examples[+d.i] }; upd(); },
  addEntry() {
    const dr = S.draft; if (!dr.text.trim() || !dr.date) return toast('Add a date and some text.');
    S.journal.push({ id: 'j' + Date.now(), date: dr.date, type: dr.type, text: dr.text.trim(), confirmed: false });
    log('journal_added', { type: dr.type, date: dr.date }); S.draft = { date: dr.date, type: 'project', text: '' }; S.journalPrompt = false; toast('Entry added. Confirm it as true so Landed can use it.'); upd();
  },
  confirmEntry(d) {
    const j = S.journal.find(x => x.id === d.id); j.confirmed = true; log('journal_confirmed', { id: d.id });
    if (j.type === 'goal') { S.goalNote = j.text; toast('Goal saved. Your job preferences and rankings are updated.'); } else toast('Confirmed. Landed can now use this fact.');
    upd();
  },
  editEntry(d) { S.editJournal = d.id; S.editText = S.journal.find(x => x.id === d.id).text; upd(); },
  saveEntry(d) { const j = S.journal.find(x => x.id === d.id); j.text = S.editText.trim(); j.confirmed = false; S.editJournal = null; log('journal_edited', { id: d.id }); toast('Saved. Please confirm the edited entry is true.'); upd(); },
  cancelEntry() { S.editJournal = null; upd(); },
  deleteEntry(d) { S.journal = S.journal.filter(x => x.id !== d.id); log('journal_deleted', { id: d.id }); upd(); },

  /* search */
  startOvernight() {
    if (S.paused) return toast('Your search is paused.'); if (S.shortlist) return A.home();
    go({ tab: 'recs', view: { name: 'overnight', phase: 'run' } });
  },
  skipOvernight() { if (window._ov) { clearInterval(window._ov); window._ov = null; } finishOvernight(); },
  openShortlist() { log('shortlist_opened'); go({ view: null, tab: 'recs' }); },
  findNow() {
    S.searching = true; upd();
    setTimeout(() => {
      S.searching = false;
      if (!S.newRolesFound) { S.newRolesFound = true; S.shortlist.push(...D.new_roles.map(r => r.id)); log('on_demand_search', { found: D.new_roles.map(r => r.id) }); toast(`Found ${D.new_roles.length} new role: ${D.new_roles[0].company}`); }
      else { log('on_demand_search', { found: [] }); toast(D.search.onDemandNone); }
      upd();
    }, 1500);
  },
  openRole(d) { log('role_opened', { id: d.id }); go({ view: { name: 'role', roleId: d.id } }); },
  label(d) {
    const role = roleById(d.role), req = role.requirements.find(q => q.id === d.req);
    rs(d.role).labels[d.req] = { v: d.v, kind: d.kind };
    log(d.kind === 'override' ? 'eligibility_override' : 'eligibility_label', { role: d.role, req: d.req, answer: d.v, landed_said: autoEval(req).s });
    if (d.v === 'not' && autoEval(req).s !== 'not') {
      Object.assign(rs(d.role), { status: 'removed', removedReason: `You said you don't qualify for "${req.text}", so Landed removed it.` });
      toast('Role removed from your shortlist.'); return go({ view: null, tab: 'recs' });
    }
    toast(d.v === 'meets' ? 'Updated. Eligibility recalculated.' : 'Saved.'); upd();
  },
  clearLabel(d) { delete rs(d.role).labels[d.req]; log('eligibility_reset', { role: d.role, req: d.req }); upd(); },
  restore(d) { Object.assign(rs(d.id), { status: 'new', labels: {} }); upd(); },
  skip(d) { S.skipping = d.id; S.skipReason = ''; go({ view: null, tab: 'recs' }); },
  cancelSkip() { S.skipping = null; upd(); },
  confirmSkip(d) {
    const role = roleById(d.id); Object.assign(rs(d.id), { status: 'skipped', skipReason: S.skipReason }); role.tags.forEach(t => S.penalties[t] = (S.penalties[t] || 0) + .05);
    log('skip', { role: d.id, reason: S.skipReason || null }); S.skipping = null; toast('Skipped. Landed will rank similar roles lower for you.'); upd();
  },
  prepare(d) {
    const role = roleById(d.id), o = overall(role);
    if (o === 'not') return toast("You don't meet a requirement for this role.");
    if (o === 'input') { toast('Please resolve the flagged requirement first.'); return go({ view: { name: 'role', roleId: d.id } }); }
    rs(d.id).status = rs(d.id).status === 'applied' ? 'applied' : 'approved'; log('approve', { role: d.id, rank: ranked().findIndex(r => r.id === d.id) + 1 });
    ensureDocs(role); go({ tab: 'recs', view: { name: 'tailor', roleId: d.id } });
  },

  /* tailoring */
  docTab(d) { S.docs[S.view.roleId].tab = d.id; S.editing = null; upd(); },
  src(d) { S.srcOpen ||= {}; S.srcOpen[d.key] = S.srcOpen[d.key] === +d.i ? null : +d.i; upd(); },
  _line(d) { return S.docs[S.view.roleId][d.doc].find(l => l.id === d.lid); },
  lineAccept(d) { const l = A._line(d); l.state = 'accepted'; log('line_accept', { doc: d.doc, line: d.lid }); upd(); },
  lineEdit(d) { S.editing = d.doc + ':' + d.lid; S.editText = A._line(d).text; upd(); },
  lineSave(d) { const l = A._line(d); l.text = S.editText.trim(); l.state = 'edited'; S.editing = null; log('line_edit', { doc: d.doc, line: d.lid, chars: lev(l.gen, l.text) }); upd(); },
  lineCancel() { S.editing = null; upd(); },
  lineRevert(d) {
    const l = A._line(d);
    if (d.doc === 'resume' && !l.original) { l.state = 'removed'; } else { l.text = d.doc === 'resume' ? l.original : l.gen; l.state = 'reverted'; }
    log('line_revert', { doc: d.doc, line: d.lid }); upd();
  },
  regen() { const dd = S.docs[S.view.roleId]; dd.variant++; dd.letter = buildLetter(roleById(S.view.roleId), dd.variant); log('cover_letter_regenerated', { variant: dd.variant }); toast('New cover letter draft generated.'); upd(); },
  saveDocs() {
    const id = S.view.roleId, st = editStats(S.docs[id]); log('documents_saved', { role: id, ...st });
    toast(`Saved. You edited ${st.pct}% of the generated text.`); ensureForm(roleById(id)); go({ view: { name: 'form', roleId: id } });
  },

  /* form */
  cancelApp(d) { log('submission_cancelled', { role: d.id }); go({ view: { name: 'role', roleId: d.id }, tab: 'recs' }); },
  submitApp(d) {
    const role = roleById(d.id), F = S.forms[d.id];
    if (D.form.fields.some(f => !String(F.values[f.id] ?? '').trim())) { toast('Please complete the fields marked "Needs your input".'); return upd(); }
    const corr = D.form.fields.filter(f => !F.flagged.includes(f.id) && F.values[f.id] !== F.orig[f.id]).map(f => ({ field: f.id, from: F.orig[f.id], to: F.values[f.id] }));
    log('form_submitted', { role: d.id, corrections: corr, completedFlagged: F.flagged, fieldsPrefilled: F.filled, fieldsTotal: F.total });
    rs(d.id).status = 'applied'; S.apps.push({ id: 'app_' + d.id, roleId: d.id, company: role.company, title: role.shortTitle, status: 'Submitted', submittedAt: new Date().toISOString() });
    go({ view: { name: 'submitted', roleId: d.id } });
  },

  /* tracker */
  connectEmail() { S.emailConnected = true; log('email_connected'); toast('Email connected (simulated).'); upd(); },
  ffTwoWeeks() { S.twoWeeks = true; go({ tab: 'tracker', view: null }); toast('Two weeks later…'); },
  mark(d) {
    if (!d.v) return; const a = S.apps.find(x => x.id === d.id);
    log('outcome_reported', { app: d.id, outcome: d.v, via: d.via || 'manual' });
    if (d.v === 'Interview') { S.askInterview = d.id; return go({ tab: 'tracker', view: null }); }
    a.status = d.v; if (d.v === 'Offer') { S.offer = { appId: d.id, decision: 'none' }; return go({ view: { name: 'offer' } }); } upd();
  },
  saveInterview() {
    const dt = S.interviewDT || '2026-12-03T14:00', a = S.apps.find(x => x.id === S.askInterview); a.status = 'Interview';
    S.interview = { appId: a.id, dt, stage: 'before', reflection: null }; S.askInterview = null; log('interview_scheduled', { app: a.id, dt }); go({ view: { name: 'prep' } });
  },
  cancelInterview() { S.askInterview = null; upd(); },
  openPrep() { go({ view: { name: 'prep' } }); },
  openOffer() { go({ view: { name: 'offer' } }); },

  /* interview prep */
  practice(d) { S.practice = +d.i; S.practiceText = ''; upd(); },
  closePractice() { S.practice = null; upd(); },
  getPractice(d) {
    const t = S.practiceText.trim(), P = D.interview.practice_feedback;
    const text = t.length < 40 ? P.tooShort : /\d/.test(t) ? P.withNumber : P.withoutNumber;
    S.practiceFb[d.i] = { text, rating: null }; log('practice_answer', { q: +d.i, chars: t.length }); S.practice = null; upd();
  },
  rateFb(d) { S.practiceFb[d.i].rating = d.v; log('feedback_rating', { kind: 'practice', q: +d.i, rating: d.v }); upd(); },
  interviewDone() { S.interview.stage = 'after'; log('interview_completed'); upd(); },
  rate(d) { S.rating = +d.v; upd(); },
  submitReflection() {
    const t = S.reflectText.trim(); if (!t) return toast('Write a quick reflection first.'); if (!S.rating) return toast('Rate how the interview felt.');
    const R = D.interview.reflection_feedback, low = t.toLowerCase();
    const hit = R.rules.find(r => r.keywords.some(k => low.includes(k)));
    S.interview.reflection = { text: t, rating: S.rating, feedback: hit ? hit.feedback : R.default, fbRating: null };
    log('reflection', { text: t, selfRating: S.rating }); S.reflectText = ''; S.rating = 0; upd();
  },
  rateRefl(d) { S.interview.reflection.fbRating = d.v; log('feedback_rating', { kind: 'reflection', rating: d.v }); upd(); },

  /* offer */
  acceptOffer() { S.offer.decision = 'accepted'; S.paused = true; log('offer_accepted'); upd(); },
  stillDeciding() { S.offer.decision = 'pending'; log('offer_pending'); upd(); },
  pauseSearch() { S.paused = true; log('search_paused'); toast('Search paused.'); upd(); },
  resumeSearch() { S.paused = false; log('search_resumed'); upd(); },

  download() {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S.log, null, 2)], { type: 'application/json' })); a.download = 'landed_activity_log.json'; a.click();
  },
  reset() { if (confirm('Reset the demo and start over?')) { localStorage.removeItem(KEY); S = fresh(); render(); window.scrollTo(0, 0); } }
};

/* ---------- events ---------- */
function setPath(path, val) { const ks = path.split('.'); let o = S; ks.slice(0, -1).forEach(k => o = o[k] ??= {}); o[ks.at(-1)] = val; }
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && A[el.dataset.act]) A[el.dataset.act](el.dataset); });
document.addEventListener('input', e => { const p = e.target.dataset?.bind; if (p) { setPath(p, e.target.value); save(); } });
document.addEventListener('change', e => {
  const t = e.target, p = t.dataset?.bind;
  if (p) { setPath(p, t.value); save(); if (t.tagName === 'SELECT' || t.type === 'date') render(); }
  if (t.dataset?.change === 'mark') A.mark({ id: t.dataset.id, v: t.value });
  if (t.id === 'resume' && t.files[0]) { if (!/\.pdf$/i.test(t.files[0].name)) return toast('Please choose a PDF file.'); S.profile.resumeName = t.files[0].name; upd(); }
});

fetch('simulated_responses.json').then(r => r.json()).then(j => {
  D = j; try { S = { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { S = fresh(); }
  if (S.screen === 'parsing') S.screen = 'onboarding';
  render();
}).catch(err => { document.body.innerHTML = '<pre style="padding:20px">Could not load simulated_responses.json. Serve this folder over HTTP (see README), do not open index.html directly.\n' + err + '</pre>'; });
