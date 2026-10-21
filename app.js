const C = window.PTRR_CONFIG || {};
const sb = C.supabasePublishableKey && !C.supabasePublishableKey.includes("PASTE_")
  ? supabase.createClient(C.supabaseUrl, C.supabasePublishableKey)
  : null;

const $ = id => document.getElementById(id);
let mode = "login";
let clients = [];
let sessions = [];

const money = n => new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0
}).format(Number(n || 0));

const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
}[m]));

const daysAgo = date => date
  ? Math.floor((Date.now() - new Date(date)) / 86400000)
  : 999;

const sessionsForClient = clientId =>
  sessions.filter(s => s.client_id === clientId);


const PACKAGE_OPTIONS = [
  { value: "1_session_pack", label: "1 session pack", sessions: 1, monthly: false },
  { value: "10_sessions_pack", label: "10 sessions pack", sessions: 10, monthly: false },
  { value: "20_sessions_pack", label: "20 sessions pack", sessions: 20, monthly: false },
  { value: "4_dd", label: "4 sessions by Direct Debit", sessions: 4, monthly: true },
  { value: "8_dd", label: "8 sessions by Direct Debit", sessions: 8, monthly: true },
  { value: "12_dd", label: "12 sessions by Direct Debit", sessions: 12, monthly: true }
];

const packageInfo = value => PACKAGE_OPTIONS.find(p => p.value === value) || null;

const remainingSessions = c => {
  const p = packageInfo(c.package);
  const total = Number(c.package_sessions || 0);
  const used = p?.monthly ? sessionsThisMonth(c.id) : sessionsForClient(c.id).length;
  return Math.max(0, total - used);
};

const sessionsThisMonth = clientId => {
  const now = new Date();
  return sessionsForClient(clientId).filter(s => {
    const d = new Date(s.session_date);
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth();
  }).length;
};

function analyse(c) {
  let score = 0;
  const reasons = [];
  const clientSessions = sessionsForClient(c.id);
  const latestSession = clientSessions.length
    ? clientSessions.reduce((a,b) =>
        new Date(a.session_date) > new Date(b.session_date) ? a : b)
    : null;

  const lastSessionDate = latestSession?.session_date || null;
  const daysSinceSession = daysAgo(lastSessionDate);

  const leadSource = c.lead_source || (c.lead ? "Lead" : "");
  if (leadSource) {
    score += 4;
    reasons.push(`Lead: ${leadSource}`);
  }

  const remaining = remainingSessions(c);
  if (remaining <= 2 && Number(c.package_sessions || 0) > 0 && !leadSource) {
    score += 3;
    reasons.push(`Package nearly finished (${remaining} remaining)`);
  }

  if (!lastSessionDate || daysSinceSession >= 14) {
    score += 2;
    reasons.push("No recent session");
  }

  const monthly = sessionsThisMonth(c.id);
  const p = packageInfo(c.package);
  if (p?.monthly && monthly < p.sessions && daysSinceSession >= 7) {
    score += 2;
    reasons.push(`Frequency below target (${monthly}/${p.sessions} this month)`);
  }

  return {
    score,
    reasons,
    opp: Number(c.package_value || 0),
    monthly,
    remaining,
    latestSession: lastSessionDate,
    daysSinceSession
  };
}

function render() {
  const analysed = clients.map(c => ({ c, x: analyse(c) }));
  const risk = analysed.filter(x => x.x.score >= 3);
  const opportunity = risk.reduce((sum, x) => sum + x.x.opp, 0);

  $("stats").innerHTML = [
    ["CLIENTS", clients.length],
    ["AT RISK", risk.length],
    ["FOLLOW-UPS", analysed.filter(x => x.x.score > 0).length],
    ["REVENUE OPPORTUNITY", money(opportunity)]
  ].map(x => `
    <div class="stat">
      <div class="l">${x[0]}</div>
      <div class="v">${x[1]}</div>
    </div>
  `).join("");

  const ranked = analysed
    .filter(x => x.x.score > 0)
    .sort((a,b) => b.x.score - a.x.score || b.x.opp - a.x.opp);

  $("priorityList").innerHTML = ranked.length
    ? ranked.slice(0, 8).map(({c,x}) => card(c,x,true)).join("")
    : `<div class="empty">No urgent opportunities right now. Nice work.</div>`;

  const q = $("search").value.toLowerCase();
  const list = clients.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.phone || "").toLowerCase().includes(q)
  );

  $("clientList").innerHTML = list.length
    ? list.map(c => card(c, analyse(c), false)).join("")
    : `<div class="empty">No clients found.</div>`;
}

function card(c, x) {
  return `
    <div class="client">
      <div>
        <div class="name">
          ${esc(c.name)}
          ${x.score ? `<span class="badge">${x.score >= 4 ? "Priority" : "Follow-up"}</span>` : ""}
        </div>
        <div class="meta">
          ${c.phone ? esc(c.phone) : "No phone"} ·
          ${esc(packageInfo(c.package)?.label || c.package || "No package")} ·
          ${money(c.package_value)} ·
          ${x.remaining} sessions remaining ·
          ${x.monthly} this month${c.lead_source ? ` · ${esc(c.lead_source)}` : ""}
        </div>
        ${x.reasons.length ? `<div class="why"><b>Why:</b> ${esc(x.reasons.join(" · "))}</div>` : ""}
      </div>
      <div class="actions">
        <button class="ghost small" onclick="detail('${c.id}')">View</button>
        ${c.phone
          ? `<a class="ghost small" target="_blank" href="https://wa.me/${String(c.phone).replace(/\D/g,"")}">WhatsApp</a>`
          : ""}
      </div>
    </div>
  `;
}

async function load() {
  if (!sb) return;

  const { data: { user } } = await sb.auth.getUser();

  const clientsResult = await sb
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (clientsResult.error) {
    $("clientList").innerHTML = `<div class="empty">${esc(clientsResult.error.message)}</div>`;
    return;
  }

  const clientIds = (clientsResult.data || []).map(c => c.id);

  let sessionData = [];
  if (clientIds.length) {
    const sessionResult = await sb
      .from("sessions")
      .select("*")
      .in("client_id", clientIds)
      .order("session_date", { ascending: false });

    if (sessionResult.error) {
      console.error(sessionResult.error);
    } else {
      sessionData = sessionResult.data || [];
    }
  }

  clients = clientsResult.data || [];
  sessions = sessionData;
  render();
}

function showAuth() {
  $("authView").classList.remove("hide");
  $("appView").classList.add("hide");
}

function showApp(s) {
  $("authView").classList.add("hide");
  $("appView").classList.remove("hide");
  $("userEmail").textContent = s.user.email || "";
  load();
}

async function start() {
  if (!sb) {
    showAuth();
    $("authMsg").textContent = "Add your Publishable key to config.js first.";
    return;
  }

  const { data: { session } } = await sb.auth.getSession();
  session ? showApp(session) : showAuth();

  sb.auth.onAuthStateChange((_event, newSession) => {
    newSession ? showApp(newSession) : showAuth();
  });
}

$("loginTab").onclick = () => {
  mode = "login";
  $("loginTab").classList.add("active");
  $("signupTab").classList.remove("active");
  $("nameWrap").classList.add("hide");
  $("authSubmit").textContent = "Log in";
};

$("signupTab").onclick = () => {
  mode = "signup";
  $("signupTab").classList.add("active");
  $("loginTab").classList.remove("active");
  $("nameWrap").classList.remove("hide");
  $("authSubmit").textContent = "Create account";
};

$("authForm").onsubmit = async e => {
  e.preventDefault();
  $("authMsg").textContent = "";

  if (!sb) return;

  const email = $("email").value.trim();
  const password = $("password").value;

  if (mode === "signup") {
    const { error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: $("fullName").value.trim() }
      }
    });

    $("authMsg").textContent = error
      ? error.message
      : "Account created. Check your email if confirmation is enabled.";
  } else {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) $("authMsg").textContent = error.message;
  }
};

$("logoutBtn").onclick = () => sb.auth.signOut();
$("search").oninput = render;

$("addClientBtn").onclick = () => {
  $("clientForm").reset();
  $("clientDialog").showModal();
};

$("closeDialog").onclick = () => $("clientDialog").close();

$("clientForm").onsubmit = async e => {
  e.preventDefault();

  const { data: { user } } = await sb.auth.getUser();

  const payload = {
    user_id: user.id,
    name: $("cName").value.trim(),
    phone: $("cPhone").value.trim() || null,
    package_value: Number($("cValue").value || 0),
    package: $("cPackage").value,
    package_sessions: Number($("cPackage").selectedOptions[0]?.dataset.sessions || 0),
    target_frequency: Number($("cPackage").selectedOptions[0]?.dataset.monthly === "true" ? $("cPackage").selectedOptions[0]?.dataset.sessions : 0),
    sessions_remaining: Number($("cPackage").selectedOptions[0]?.dataset.sessions || 0),
    lead_source: $("cLeadSource").value || null,
    lead: Boolean($("cLeadSource").value),
    notes: $("cNotes").value.trim() || null
  };

  const { error } = await sb.from("clients").insert(payload);

  if (error) {
    $("clientMsg").textContent = error.message;
    return;
  }

  $("clientDialog").close();
  load();
};

window.detail = id => {
  const c = clients.find(x => x.id === id);
  if (!c) return;

  const x = analyse(c);
  const clientSessions = sessionsForClient(c.id);
  const phone = (c.phone || "").replace(/\D/g, "");

  const sessionRows = clientSessions.length
    ? clientSessions.slice(0, 10).map(s => `
        <div class="meta" style="padding:8px 0;border-bottom:1px solid #eee">
          ${new Date(s.session_date).toLocaleDateString("en-GB")}
          ${s.notes ? ` · ${esc(s.notes)}` : ""}
        </div>
      `).join("")
    : `<div class="empty">No sessions logged yet.</div>`;

  $("detailContent").innerHTML = `
    <div class="head">
      <h2>${esc(c.name)}</h2>
      <button class="icon" onclick="detailDialog.close()">×</button>
    </div>

    <p><b>Revenue opportunity:</b> ${money(x.opp)}</p>
    <p><b>Why:</b> ${esc(x.reasons.join(" · ") || "No urgent issue detected.")}</p>
    <p><b>Package:</b> ${esc(packageInfo(c.package)?.label || c.package || "—")}</p>
    <p><b>This month:</b> ${x.monthly} sessions</p>
    <p><b>Sessions remaining:</b> ${x.remaining}</p>
    <p><b>Lead source:</b> ${esc(c.lead_source || (c.lead ? "Lead" : "—"))}</p>
    <p><b>Notes:</b> ${esc(c.notes || "—")}</p>

    <div style="margin:18px 0">
      <h3>Log a session</h3>
      <label>Date
        <input id="sessionDate" type="date" value="${new Date().toISOString().slice(0,10)}">
      </label>
      <label>Notes
        <textarea id="sessionNotes" rows="2" placeholder="Optional"></textarea>
      </label>
      <div id="sessionMsg" class="msg"></div>
      <button class="primary wide" onclick="logSession('${c.id}')">Save session</button>
    </div>

    <div>
      <h3>Recent sessions</h3>
      ${sessionRows}
    </div>

    ${phone ? `
      <div style="margin-top:18px">
        <a class="primary" target="_blank"
           href="https://wa.me/${phone}?text=${encodeURIComponent(
             "Hi " + c.name.split(" ")[0] + ", just checking in. How are you getting on with your training?"
           )}">
          Open WhatsApp
        </a>
      </div>
    ` : ""}
  `;

  $("detailDialog").showModal();
};

window.logSession = async clientId => {
  const msg = $("sessionMsg");
  if (msg) msg.textContent = "Saving...";

  const { data: { user } } = await sb.auth.getUser();

  const dateValue = $("sessionDate").value;
  const notesValue = $("sessionNotes").value.trim() || null;

  if (!dateValue) {
    if (msg) msg.textContent = "Please choose a date.";
    return;
  }

  const { error: sessionError } = await sb.from("sessions").insert({
    user_id: user.id,
    client_id: clientId,
    session_date: new Date(dateValue + "T12:00:00").toISOString(),
    notes: notesValue
  });

  if (sessionError) {
    if (msg) msg.textContent = sessionError.message;
    return;
  }

  await load();

  if ($("detailDialog").open) {
    $("detailDialog").close();
    detail(clientId);
  }
};

start();
