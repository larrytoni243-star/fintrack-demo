// ============================================================
//  FinTrack Demo — Single-file Express server
//  Routes:
//    GET  /              -> customer dashboard
//    GET  /admin         -> admin console (login required)
//    POST /api/login     -> returns token
//    GET  /api/state     -> public state read
//    POST /api/state     -> admin update (token required)
//    POST /api/fee-alert -> trigger fee alert (token required)
//  Run: node server.js
//  Open: http://localhost:3000/  and  http://localhost:3000/admin
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const STATE_FILE = path.join(__dirname, 'state.json');

// ---------- Default state ----------
const defaultState = {
  portalName: 'Northbridge Financial',
  customerName: 'Jackie Rico',
  balance: 3172.68,
  progress: 0,
  statusMessage: 'Verifying Funds',
  transactionId: 'NBX-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
  eta: 'Today, 4:45 PM',
  feeAlert: false,
};

// ---------- Load / persist state ----------
let state = { ...defaultState };
if (fs.existsSync(STATE_FILE)) {
  try { state = { ...defaultState, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; }
  catch (_) { /* ignore corrupt file */ }
}
function persist() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------- Auth ----------
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';
const tokens = new Set();

function auth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token || !tokens.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ---------- Middleware ----------
app.use(express.json());

// ---------- API ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = crypto.randomUUID();
    tokens.add(token);
    return res.json({ token });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/state', (_req, res) => res.json(state));

app.post('/api/state', auth, (req, res) => {
  const allowed = ['portalName', 'customerName', 'balance', 'progress',
                   'statusMessage', 'transactionId', 'eta'];
  for (const k of allowed) {
    if (k in req.body) {
      if (k === 'balance') state[k] = Number(req.body[k]) || 0;
      else if (k === 'progress') state[k] = Math.max(0, Math.min(100, Number(req.body[k]) || 0));
      else state[k] = String(req.body[k]);
    }
  }
  persist();
  res.json(state);
});

app.post('/api/fee-alert', auth, (_req, res) => {
  state.feeAlert = true;
  persist();
  res.json({ ok: true });
});

// ---------- HTML: Dashboard ----------
const dashboardHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Northbridge Financial — Transaction Portal</title>
<style>
  :root {
    --bg:#0a0e1a; --card:#121826; --card2:#0f1420;
    --accent:#00d67d; --accent-dim:#008f54;
    --text:#e6ebf5; --muted:#6b7896; --border:#1c2537; --danger:#ff4d5e;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: radial-gradient(1200px 600px at 20% -10%, #14203a 0%, var(--bg) 60%);
    color: var(--text); min-height: 100vh; padding: 24px;
  }
  .wrap { max-width: 820px; margin: 0 auto; }

  header { display:flex; justify-content:space-between; align-items:center; margin-bottom: 28px; }
  .brand { display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:.3px; }
  .brand-dot { width:10px; height:10px; border-radius:50%; background:var(--accent);
                box-shadow:0 0 12px var(--accent); }
  .live { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--muted);
           text-transform:uppercase; letter-spacing:1px; }
  .live-dot { width:8px; height:8px; border-radius:50%; background:var(--accent);
               animation: pulse 1.6s infinite; }
  @keyframes pulse { 0%,100%{opacity:1; transform:scale(1);} 50%{opacity:.4; transform:scale(1.3);} }

  .card { background: linear-gradient(180deg, var(--card) 0%, var(--card2) 100%);
           border:1px solid var(--border); border-radius:16px; padding:24px; margin-bottom:20px; }

  .progress-head { display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; }
  .cust { font-size:22px; font-weight:700; letter-spacing:.2px; }
  .cust-sub { font-size:13px; color:var(--muted); margin-top:4px; }
  .pct { font-size:44px; font-weight:800; color:var(--accent); line-height:1;
         font-variant-numeric: tabular-nums; }

  .bar-track { margin-top:20px; height:12px; background:#0a1220;
                border-radius:999px; overflow:hidden; border:1px solid var(--border); }
  .bar-fill { height:100%; width:0%; border-radius:999px;
              background: linear-gradient(90deg, #00b368, #00d67d 60%, #4bffae);
              box-shadow: 0 0 18px rgba(0,214,125,.55);
              transition: width .9s cubic-bezier(.4,0,.2,1); }

  .status-line { margin-top:16px; font-size:14px; color:var(--muted); display:flex;
                  align-items:center; gap:8px; }
  .status-line b { color: var(--text); font-weight:600; }
  .spinner { width:12px; height:12px; border:2px solid var(--accent-dim);
             border-top-color: var(--accent); border-radius:50%;
             animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .grid { display:grid; grid-template-columns: 1fr 1fr; gap:20px; }
  @media (max-width:640px) { .grid { grid-template-columns: 1fr; } }

  .label { font-size:11px; text-transform:uppercase; letter-spacing:1.2px;
           color:var(--muted); margin-bottom:8px; }
  .balance { font-size:34px; font-weight:800; color:var(--text); font-variant-numeric: tabular-nums; }
  .mono { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size:15px;
           color:var(--accent); }
  .eta { font-size:18px; font-weight:600; }

  /* Fee alert */
  .fee-alert { position: fixed; top: 20px; right: 20px; max-width: 340px;
                background:#1a0d10; border:1px solid #5a1a24; border-left:4px solid var(--danger);
                padding:16px 40px 16px 16px; border-radius:12px; color:#ffd9dd;
                box-shadow: 0 12px 40px rgba(0,0,0,.5); display:none; animation: slideIn .3s ease; }
  .fee-alert.show { display:block; }
  .fee-alert b { display:block; color:#ff8a95; margin-bottom:4px; }
  .fee-alert .x { position:absolute; top:8px; right:12px; cursor:pointer; color:#ff8a95; font-size:18px; }
  @keyframes slideIn { from{ transform:translateX(30px); opacity:0;} to{ transform:translateX(0); opacity:1; } }

  footer { text-align:center; color:var(--muted); font-size:12px; margin-top:20px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand"><span class="brand-dot"></span><span id="portalName">Northbridge Financial</span></div>
    <div class="live"><span class="live-dot"></span> Live</div>
  </header>

  <div class="card">
    <div class="progress-head">
      <div>
        <div class="cust" id="customerName">Jackie Rico</div>
        <div class="cust-sub">Pending International Transfer</div>
      </div>
      <div class="pct" id="pct">0%</div>
    </div>
    <div class="bar-track"><div class="bar-fill" id="bar"></div></div>
    <div class="status-line">
      <span class="spinner"></span>
      Status: <b id="status">Verifying Funds</b>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="label">Available Balance</div>
      <div class="balance" id="balance">$0.00</div>
    </div>
    <div class="card">
      <div class="label">Estimated Completion Time</div>
      <div class="eta" id="eta">—</div>
    </div>
    <div class="card" style="grid-column:1/-1">
      <div class="label">Transaction ID</div>
      <div class="mono" id="txn">—</div>
    </div>
  </div>

  <footer>Demo portal — not a real financial institution</footer>
</div>

<div class="fee-alert" id="feeAlert">
  <span class="x" onclick="document.getElementById('feeAlert').classList.remove('show')">×</span>
  <b>Fee Alert</b>
  <span id="feeAlertMsg">Additional documentation required for this transaction.</span>
</div>

<script>
  const phases = [
    'Verifying Funds',
    'Clearing International Compliance',
    'Allocating Escrow Reserves',
    'Finalizing Distribution',
  ];
  let serverState = null;
  let displayedPct = 0;
  let phaseIdx = 0;

  const $ = id => document.getElementById(id);

  function fmtMoney(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Animate percentage number toward target
  function animatePct(target) {
    const step = () => {
      if (Math.abs(displayedPct - target) < 0.5) { displayedPct = target; }
      else { displayedPct += (target - displayedPct) * 0.15; }
      $('pct').textContent = Math.round(displayedPct) + '%';
      $('bar').style.width = displayedPct + '%';
      if (displayedPct !== target) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Cycle the status text on the client every 3s UNLESS admin pinned a custom one.
  // Rule: if admin status matches one of the phase presets, we cycle; else we honour it.
  function tickPhase() {
    if (!serverState) return;
    const isPreset = phases.includes(serverState.statusMessage);
    if (isPreset) {
      phaseIdx = (phaseIdx + 1) % phases.length;
      $('status').textContent = phases[phaseIdx];
    } else {
      $('status').textContent = serverState.statusMessage;
    }
  }
  setInterval(tickPhase, 3000);

  let lastFeeAlert = false;

  async function poll() {
    try {
      const r = await fetch('/api/state');
      const s = await r.json();
      const changed = !serverState || JSON.stringify(s) !== JSON.stringify(serverState);
      serverState = s;

      if (changed) {
        $('portalName').textContent = s.portalName;
        $('customerName').textContent = s.customerName;
        $('balance').textContent = fmtMoney(s.balance);
        $('txn').textContent = s.transactionId;
        $('eta').textContent = s.eta;
        animatePct(Number(s.progress));
        // Sync phase index when admin sends a known preset
        const idx = phases.indexOf(s.statusMessage);
        if (idx >= 0) { phaseIdx = idx; $('status').textContent = phases[idx]; }
        else { $('status').textContent = s.statusMessage; }
      }

      // Fee alert only fires on rising edge
      if (s.feeAlert && !lastFeeAlert) {
        $('feeAlert').classList.add('show');
      }
      lastFeeAlert = s.feeAlert;
    } catch (e) { /* offline tolerance */ }
  }

  poll();
  setInterval(poll, 2000);
</script>
</body>
</html>`;

// ---------- HTML: Admin ----------
const adminHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Admin Console — FinTrack</title>
<style>
  :root {
    --bg:#0a0e1a; --card:#121826; --card2:#0f1420;
    --accent:#00d67d; --accent-dim:#008f54;
    --text:#e6ebf5; --muted:#6b7896; --border:#1c2537; --danger:#ff4d5e;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: radial-gradient(1000px 500px at 80% -10%, #14203a 0%, var(--bg) 60%);
    color: var(--text); min-height: 100vh; padding: 24px;
  }
  .wrap { max-width: 760px; margin: 0 auto; }

  .brand { display:flex; align-items:center; gap:10px; font-weight:700;
           letter-spacing:.3px; margin-bottom:24px; }
  .brand-dot { width:10px; height:10px; border-radius:50%; background:var(--accent);
               box-shadow:0 0 12px var(--accent); }
  .tag { font-size:11px; color:var(--muted); border:1px solid var(--border);
         padding:2px 8px; border-radius:6px; margin-left:8px; text-transform:uppercase;
         letter-spacing:1px; }

  .card { background: linear-gradient(180deg, var(--card) 0%, var(--card2) 100%);
          border:1px solid var(--border); border-radius:16px; padding:24px; margin-bottom:20px; }

  h2 { font-size:15px; font-weight:600; margin-bottom:16px; color:var(--text); }

  label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:1.2px;
          color:var(--muted); margin:14px 0 6px; }
  input, select {
    width:100%; background:#0a1220; border:1px solid var(--border); color:var(--text);
    padding:11px 13px; border-radius:10px; font-size:14px; outline:none;
    font-family: inherit;
  }
  input:focus, select:focus { border-color: var(--accent-dim); box-shadow:0 0 0 3px rgba(0,214,125,.12); }
  input[type=range] { padding:0; height:8px; -webkit-appearance:none; background:#0a1220;
                      border-radius:999px; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:22px; height:22px;
    border-radius:50%; background:var(--accent); box-shadow:0 0 12px rgba(0,214,125,.6);
    cursor:pointer; border:3px solid #0a1220; }

  .row { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width:600px) { .row { grid-template-columns: 1fr; } }

  .slider-head { display:flex; justify-content:space-between; align-items:baseline; margin-top:6px; }
  .slider-val { font-size:26px; font-weight:800; color:var(--accent); font-variant-numeric: tabular-nums; }

  button {
    background: var(--accent); color:#001a10; border:none; border-radius:10px;
    padding:12px 20px; font-weight:700; cursor:pointer; font-size:14px;
    font-family: inherit; letter-spacing:.2px;
  }
  button:hover { filter: brightness(1.08); }
  button.ghost { background: transparent; color: var(--text); border:1px solid var(--border); }
  button.danger { background: var(--danger); color:#fff; }

  .actions { display:flex; gap:12px; flex-wrap:wrap; margin-top:20px; }

  .login-card { max-width: 380px; margin: 80px auto; }
  .login-card h1 { font-size:22px; margin-bottom:6px; }
  .login-card p { color:var(--muted); font-size:13px; margin-bottom:20px; }
  .err { color: var(--danger); font-size:13px; margin-top:10px; min-height:18px; }

  .hidden { display:none !important; }

  .status { font-size:12px; color:var(--muted); text-align:center; margin-top:14px;
            min-height:18px; }
  .status.ok { color: var(--accent); }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">
    <span class="brand-dot"></span> FinTrack
    <span class="tag">Admin Console</span>
  </div>

  <!-- LOGIN -->
  <div id="loginView" class="card login-card">
    <h1>Sign in</h1>
    <p>Authorized personnel only</p>
    <label>Username</label>
    <input id="u" autocomplete="username" value="admin" />
    <label>Password</label>
    <input id="p" type="password" autocomplete="current-password" placeholder="admin123" />
    <div class="actions"><button onclick="login()">Sign In</button></div>
    <div class="err" id="loginErr"></div>
  </div>

  <!-- PANEL -->
  <div id="panelView" class="hidden">
    <div class="card">
      <h2>Identity</h2>
      <div class="row">
        <div>
          <label>Portal Name</label>
          <input id="portalName" />
        </div>
        <div>
          <label>Customer Name</label>
          <input id="customerName" />
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Transaction Progress</h2>
      <div class="slider-head">
        <label style="margin:0">Progress Percentage</label>
        <span class="slider-val" id="pctOut">0%</span>
      </div>
      <input type="range" id="progress" min="0" max="100" value="0"
             oninput="document.getElementById('pctOut').textContent = this.value + '%'" />
    </div>

    <div class="card">
      <h2>Financials</h2>
      <label>Available Balance (USD)</label>
      <input type="number" step="0.01" id="balance" />
    </div>

    <div class="card">
      <h2>Status Message</h2>
      <label>Preset</label>
      <select id="preset" onchange="if(this.value) document.getElementById('statusMessage').value=this.value">
        <option value="">— choose a preset —</option>
        <option>Verifying Funds</option>
        <option>Clearing International Compliance</option>
        <option>Allocating Escrow Reserves</option>
        <option>Finalizing Distribution</option>
      </select>
      <label>Custom / Current Status</label>
      <input id="statusMessage" />
    </div>

    <div class="card">
      <h2>Identifiers & Timing</h2>
      <div class="row">
        <div>
          <label>Transaction ID</label>
          <input id="transactionId" />
        </div>
        <div>
          <label>Estimated Completion Time</label>
          <input id="eta" />
        </div>
      </div>
    </div>

    <div class="actions">
      <button onclick="save()">Save Changes</button>
      <button class="danger" onclick="feeAlert()">Trigger Fee Alert</button>
      <button class="ghost" onclick="logout()">Log Out</button>
    </div>
    <div class="status" id="saveStatus"></div>
  </div>
</div>

<script>
  const $ = id => document.getElementById(id);
  const TOKEN_KEY = 'fintrack_admin_token';

  function token() { return localStorage.getItem(TOKEN_KEY); }

  async function login() {
    $('loginErr').textContent = '';
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('u').value, password: $('p').value })
    });
    if (!r.ok) { $('loginErr').textContent = 'Invalid username or password.'; return; }
    const { token: t } = await r.json();
    localStorage.setItem(TOKEN_KEY, t);
    showPanel();
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    $('panelView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
  }

  async function loadState() {
    const r = await fetch('/api/state');
    const s = await r.json();
    $('portalName').value = s.portalName;
    $('customerName').value = s.customerName;
    $('balance').value = s.balance;
    $('progress').value = s.progress;
    $('pctOut').textContent = s.progress + '%';
    $('statusMessage').value = s.statusMessage;
    $('transactionId').value = s.transactionId;
    $('eta').value = s.eta;
  }

  async function save() {
    const body = {
      portalName: $('portalName').value,
      customerName: $('customerName').value,
      balance: Number($('balance').value),
      progress: Number($('progress').value),
      statusMessage: $('statusMessage').value,
      transactionId: $('transactionId').value,
      eta: $('eta').value,
    };
    const r = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token() },
      body: JSON.stringify(body),
    });
    const st = $('saveStatus');
    if (r.ok) { st.textContent = '✓ Saved — dashboard updated'; st.className = 'status ok'; }
    else { st.textContent = '✗ Save failed'; st.className = 'status'; }
    setTimeout(() => { st.textContent = ''; st.className = 'status'; }, 2500);
  }

  async function feeAlert() {
    const r = await fetch('/api/fee-alert', {
      method: 'POST',
      headers: { 'x-auth-token': token() }
    });
    const st = $('saveStatus');
    if (r.ok) { st.textContent = '✓ Fee alert sent to dashboard'; st.className = 'status ok'; }
    else { st.textContent = '✗ Failed'; st.className = 'status'; }
    setTimeout(() => { st.textContent = ''; st.className = 'status'; }, 2500);
  }

  function showPanel() {
    $('loginView').classList.add('hidden');
    $('panelView').classList.remove('hidden');
    loadState();
  }

  // Auto-restore session
  if (token()) {
    fetch('/api/state', { headers: { 'x-auth-token': token() } })
      .then(r => r.ok ? showPanel() : logout());
  }
</script>
</body>
</html>`;

// ---------- Routes ----------
app.get('/', (_req, res) => res.type('html').send(dashboardHTML));
app.get('/admin', (_req, res) => res.type('html').send(adminHTML));

// ---------- Start ----------
app.listen(PORT, () => {
  console.log('\\n  ✓ FinTrack demo running');
  console.log('  Dashboard : http://localhost:' + PORT + '/');
  console.log('  Admin     : http://localhost:' + PORT + '/admin');
  console.log('  Login     : admin / admin123\\n');
});