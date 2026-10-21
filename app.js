const C = window.PTRR_CONFIG || {};
const sb = C.supabasePublishableKey && !C.supabasePublishableKey.includes("PASTE_")
  ? supabase.createClient(C.supabaseUrl, C.supabasePublishableKey)
  : null;

const $ = id => document.getElementById(id);
let mode = "login";
let clients = [];
let sessions = [];
let packages = [];
let activeClientId = null;

const money = n => new Intl.NumberFormat("en-GB", {
  style: "currency", currency: "GBP", maximumFractionDigits: 0
}).format(Number(n || 0));

const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
}[m]));

const daysAgo = date => date ? Math.floor((Date.now() - new Date(date)) / 86400000) : 999;
const sessionsForClient = clientId => sessions.filter(s => s.client_id === clientId);
const packagesForClient = clientId => packages
  .filter(p => p.client_id === clientId)
  .sort((a,b) => new Date(b.purchased_at) - new Date(a.purchased_at));

const PACKAGE_OPTIONS = [
  { value: "1_session_pack", label: "1 session pack", sessions: 1, monthly: false },
  { value: "10_sessions_pack", label: "10 sessions pack", sessions: 10, monthly: false },
  { value: "20_sessions_pack", label: "20 sessions pack", sessions: 20, monthly: false },
  { value: "4_dd", label: "4 sessions by Direct Debit", sessions: 4, monthly: true },
  { value: "8_dd", label: "8 sessions by Direct Debit", sessions: 8, monthly: true },
  { value: "12_dd", label: "12 sessions by Direct Debit", sessions: 12, monthly: true }
];

const packageInfo = value => PACKAGE_OPTIONS.find(p => p.value === value) || null;
const PACKAGE_PRICES = {
  "1_session_pack": 100,
  "10_sessions_pack": 950,
  "20_sessions_pack": 1800,
  "4_dd": 340,
  "8_dd": 680,
  "12_dd": 1020
};
const packagePrice = value => PACKAGE_PRICES[value] ?? 0;
const sessionsThisMonth = clientId => {
  const now = new Date();
  return sessionsForClient(clientId).filter(s => {
    const d = new Date(s.session_date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
};

function usedForPackage(p) {
  const linked = sessions.filter(s => s.package_id === p.id);
  return p.monthly ? linked.filter(s => {
    const d = new Date(s.session_date), now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length : linked.length;
}

function remainingForPackage(p) {
  return Math.max(0, Number(p.package_sessions || 0) - usedForPackage(p));
}

function clientPackageSummary(clientId) {
  const ps = packagesForClient(clientId);
  const remaining = ps.reduce((sum, p) => sum + remainingForPackage(p), 0);
  const opportunity = ps.reduce((sum, p) => sum + remainingForPackage(p) * Number(p.package_value || 0), 0);
  return { ps, remaining, opportunity };
}

function analyse(c) {
  let score = 0;
  const reasons = [];
  const clientSessions = sessionsForClient(c.id);
  const latestSession = clientSessions.length
    ? clientSessions.reduce((a,b) => new Date(a.session_date) > new Date(b.session_date) ? a : b)
    : null;
  const lastSessionDate = latestSession?.session_date || null;
  const daysSinceSession = daysAgo(lastSessionDate);
  const leadSource = c.lead_source || (c.lead ? "Lead" : "");

  if (leadSource) { score += 4; reasons.push(`Lead: ${leadSource}`); }

  const summary = clientPackageSummary(c.id);
  if (summary.remaining <= 2 && summary.remaining > 0 && !leadSource) {
    score += 3; reasons.push(`Package nearly finished (${summary.remaining} remaining)`);
  }
  if (!lastSessionDate || daysSinceSession >= 14) {
    score += 2; reasons.push("No recent session");
  }

  return {
    score,
    reasons,
    opp: summary.opportunity,
    monthly: sessionsThisMonth(c.id),
    remaining: summary.remaining,
    packageCount: summary.ps.length,
    latestSession: lastSessionDate,
    daysSinceSession
  };
}

function render() {
  const analysed = clients.map(c => ({ c, x: analyse(c) }));
  const risk = analysed.filter(x => x.x.score >= 3);
  const opportunity = analysed.reduce((sum, x) => sum + x.x.opp, 0);

  const totalRemainingSessions = analysed.reduce((sum, x) => sum + x.x.remaining, 0);
  $("stats").innerHTML = [
    ["CLIENTS", clients.length],
    ["AT RISK", risk.length],
    ["FOLLOW-UPS", analysed.filter(x => x.x.score > 0).length],
    ["REMAINING SESSIONS", totalRemainingSessions],
    ["REVENUE OPPORTUNITY", money(opportunity)]
  ].map(x => `<div class="stat"><div class="l">${x[0]}</div><div class="v">${x[1]}</div></div>`).join("");

  const ranked = analysed.filter(x => x.x.score > 0)
    .sort((a,b) => b.x.score - a.x.score || b.x.opp - a.x.opp);

  $("priorityList").innerHTML = ranked.length
    ? ranked.slice(0, 8).map(({c,x}) => card(c,x)).join("")
    : `<div class="empty">No urgent opportunities right now. Nice work.</div>`;

  const q = $("search").value.toLowerCase();
  const list = clients.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.phone || "").toLowerCase().includes(q) ||
    (c.email || "").toLowerCase().includes(q)
  );
  $("clientList").innerHTML = list.length
    ? list.map(c => card(c, analyse(c))).join("")
    : `<div class="empty">No clients found.</div>`;
}

function card(c, x) {
  return `<div class="client">
    <div>
      <div class="name">${esc(c.name)} ${x.score ? `<span class="badge">${x.score >= 4 ? "Priority" : "Follow-up"}</span>` : ""}</div>
      <div class="meta">${c.phone ? esc(c.phone) : "No phone"} · ${c.email ? esc(c.email) : "No email"} · ${x.packageCount} package${x.packageCount === 1 ? "" : "s"} · ${x.remaining} sessions remaining · ${x.monthly} this month${c.lead_source ? ` · ${esc(c.lead_source)}` : ""}</div>
      ${x.reasons.length ? `<div class="why"><b>Why:</b> ${esc(x.reasons.join(" · "))}</div>` : ""}
    </div>
    <div class="actions">
      <button class="ghost small" onclick="detail('${c.id}')">View</button>
      ${c.phone ? `<a class="ghost small" target="_blank" href="https://wa.me/${String(c.phone).replace(/\D/g,"")}">WhatsApp</a>` : ""}
    </div>
  </div>`;
}

async function load() {
  if (!sb) return;
  const clientsResult = await sb.from("clients").select("*").order("created_at", { ascending: false });
  if (clientsResult.error) {
    $("clientList").innerHTML = `<div class="empty">${esc(clientsResult.error.message)}</div>`;
    return;
  }

  clients = clientsResult.data || [];
  const clientIds = clients.map(c => c.id);
  sessions = [];
  packages = [];

  if (clientIds.length) {
    const [sessionResult, packageResult] = await Promise.all([
      sb.from("sessions").select("*").in("client_id", clientIds).order("session_date", { ascending: false }),
      sb.from("packages").select("*").in("client_id", clientIds).order("purchased_at", { ascending: false })
    ]);
    if (!sessionResult.error) sessions = sessionResult.data || [];
    if (!packageResult.error) packages = packageResult.data || [];
    else console.error(packageResult.error);
  }
  render();
}

function showAuth() { $("authView").classList.remove("hide"); $("appView").classList.add("hide"); }
function showApp(s) { $("authView").classList.add("hide"); $("appView").classList.remove("hide"); $("userEmail").textContent = s.user.email || ""; load(); }

async function start() {
  if (!sb) { showAuth(); $("authMsg").textContent = "Add your Publishable key to config.js first."; return; }
  const { data: { session } } = await sb.auth.getSession();
  session ? showApp(session) : showAuth();
  sb.auth.onAuthStateChange((_e, s) => s ? showApp(s) : showAuth());
}

$("loginTab").onclick = () => { mode="login"; $("loginTab").classList.add("active"); $("signupTab").classList.remove("active"); $("nameWrap").classList.add("hide"); $("authSubmit").textContent="Log in"; };
$("signupTab").onclick = () => { mode="signup"; $("signupTab").classList.add("active"); $("loginTab").classList.remove("active"); $("nameWrap").classList.remove("hide"); $("authSubmit").textContent="Create account"; };

$("authForm").onsubmit = async e => {
  e.preventDefault(); $("authMsg").textContent = ""; if (!sb) return;
  const email=$("email").value.trim(), password=$("password").value;
  if (mode === "signup") {
    const {error}=await sb.auth.signUp({email,password,options:{data:{full_name:$("fullName").value.trim()}}});
    $("authMsg").textContent=error?error.message:"Account created. Check your email if confirmation is enabled.";
  } else { const {error}=await sb.auth.signInWithPassword({email,password}); if(error) $("authMsg").textContent=error.message; }
};

$("logoutBtn").onclick=()=>sb.auth.signOut();
$("search").oninput=render;
$("addClientBtn").onclick=()=>{ $("clientForm").reset(); $("clientDialog").showModal(); };
$("closeDialog").onclick=()=>$("clientDialog").close();

$("clientForm").onsubmit=async e=>{
  e.preventDefault();
  const {data:{user}}=await sb.auth.getUser();
  const payload={
    user_id:user.id,
    name:$("cName").value.trim(),
    phone:$("cPhone").value.trim()||null,
    email:$("cEmail").value.trim()||null,
    lead_source:$("cLeadSource").value||null,
    lead:Boolean($("cLeadSource").value),
    notes:$("cNotes").value.trim()||null
  };
  const {error}=await sb.from("clients").insert(payload);
  if(error){$("clientMsg").textContent=error.message;return;}
  $("clientDialog").close(); await load();
};

function packageRemainingLabel(p) { return `${remainingForPackage(p)} remaining`; }

window.detail = id => {
  const c=clients.find(x=>x.id===id); if(!c)return;
  activeClientId=id;
  const x=analyse(c), ps=packagesForClient(c.id), clientSessions=sessionsForClient(c.id), phone=(c.phone||"").replace(/\D/g,"");
  const sessionRows=clientSessions.length ? clientSessions.slice(0,10).map(s=>`<div class="meta" style="padding:8px 0;border-bottom:1px solid #eee">${new Date(s.session_date).toLocaleDateString("en-GB")}${s.notes?` · ${esc(s.notes)}`:""}</div>`).join("") : `<div class="empty">No sessions logged yet.</div>`;
  const packageRows=ps.length ? ps.map(p=>`<div style="padding:12px 0;border-bottom:1px solid #eee"><div><b>${esc(packageInfo(p.package)?.label||p.package)}</b> · ${money(p.package_value)}</div><div class="meta">Purchased ${new Date(p.purchased_at).toLocaleDateString("en-GB")} · ${packageRemainingLabel(p)}</div></div>`).join("") : `<div class="empty">No packages purchased yet.</div>`;
  const packageSelect=ps.filter(p=>remainingForPackage(p)>0).map(p=>`<option value="${p.id}">${esc(packageInfo(p.package)?.label||p.package)} · ${money(p.package_value)} · ${remainingForPackage(p)} remaining</option>`).join("");

  $("detailContent").innerHTML=`
    <div class="head"><div><h2>${esc(c.name)}</h2></div><div class="actions"><button class="ghost small" onclick="openEditClient('${c.id}')">Edit</button><button class="icon" onclick="detailDialog.close()">×</button></div></div>
    <p><b>Email:</b> ${esc(c.email||"—")}</p><p><b>Phone:</b> ${esc(c.phone||"—")}</p>
    <p><b>Revenue opportunity:</b> ${money(x.opp)}</p><p><b>Sessions remaining:</b> ${x.remaining}</p>
    <p><b>Lead source:</b> ${esc(c.lead_source||(c.lead?"Lead":"—"))}</p><p><b>Notes:</b> ${esc(c.notes||"—")}</p>

    <div style="margin:18px 0"><div class="head"><h3>Packages purchased</h3><button class="primary small" onclick="openAddPackage('${c.id}')">+ Add package</button></div>${packageRows}</div>

    <div style="margin:18px 0"><h3>Log a session</h3>
      ${packageSelect ? `<label>Package<select id="sessionPackage">${packageSelect}</select></label>` : `<div class="empty">Add a package before logging a session.</div>`}
      <label>Date<input id="sessionDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label>
      <label>Notes<textarea id="sessionNotes" rows="2" placeholder="Optional"></textarea></label>
      <div id="sessionMsg" class="msg"></div>
      ${packageSelect ? `<button class="primary wide" onclick="logSession('${c.id}')">Save session</button>` : ""}
    </div>
    <div><h3>Recent sessions</h3>${sessionRows}</div>
    <div style="margin-top:22px;padding-top:18px;border-top:1px solid #eee"><button class="ghost small" style="color:#b91c1c;border-color:#fecaca" onclick="deleteClient('${c.id}')">Delete client</button><div class="meta" style="margin-top:6px">This permanently deletes the client and all recorded sessions, packages and follow-ups linked to them.</div></div>
    ${phone?`<div style="margin-top:18px"><a class="primary" target="_blank" href="https://wa.me/${phone}?text=${encodeURIComponent("Hi "+c.name.split(" ")[0]+", just checking in. How are you getting on with your training?")}">Open WhatsApp</a></div>`:""}`;
  $("detailDialog").showModal();
};

window.openAddPackage = clientId => {
  activeClientId=clientId;
  $("packageForm").reset();
  $("pPurchasedAt").value=new Date().toISOString().slice(0,10);
  $("packageMsg").textContent="";
  $("packageDialog").showModal();
};

$("closePackageDialog").onclick=()=>$("packageDialog").close();
$("packageForm").onsubmit=async e=>{
  e.preventDefault();
  if(!activeClientId)return;
  const {data:{user}}=await sb.auth.getUser();
  const opt=$("pPackage").selectedOptions[0];
  const {error}=await sb.from("packages").insert({
    user_id:user.id, client_id:activeClientId, package:$("pPackage").value,
    package_sessions:Number(opt?.dataset.sessions||0), package_value:packagePrice($("pPackage").value),
    monthly:opt?.dataset.monthly==="true", purchased_at:new Date($("pPurchasedAt").value+"T12:00:00").toISOString()
  });
  if(error){$("packageMsg").textContent=error.message;return;}
  $("packageDialog").close(); await load(); if($("detailDialog").open) detail(activeClientId);
};

window.openEditClient = clientId => {
  const c = clients.find(x => x.id === clientId);
  if (!c) return;
  activeClientId = clientId;
  $("eName").value = c.name || "";
  $("ePhone").value = c.phone || "";
  $("eEmail").value = c.email || "";
  $("editClientMsg").textContent = "";
  $("editClientDialog").showModal();
};

$("closeEditClientDialog").onclick = () => $("editClientDialog").close();
$("editClientForm").onsubmit = async e => {
  e.preventDefault();
  if (!activeClientId) return;
  const payload = {
    name: $("eName").value.trim(),
    phone: $("ePhone").value.trim() || null,
    email: $("eEmail").value.trim() || null
  };
  const { error } = await sb.from("clients").update(payload).eq("id", activeClientId);
  if (error) { $("editClientMsg").textContent = error.message; return; }
  $("editClientDialog").close();
  await load();
  if ($("detailDialog").open) detail(activeClientId);
};

$("pPackage").addEventListener("change", () => {
  const value = $("pPackage").value;
  const info = packageInfo(value);
  const price = packagePrice(value);
  $("pValue").value = price ? price.toFixed(2) : "";
  $("pRate").textContent = info ? `${info.sessions} session${info.sessions === 1 ? "" : "s"} · ${money(price / info.sessions)} per session` : "Select a package to calculate the price automatically.";
});

window.deleteClient=async clientId=>{
  const c=clients.find(x=>x.id===clientId);if(!c)return;
  if(!confirm(`Delete ${c.name} and all their sessions, packages and follow-ups?\n\nThis cannot be undone.`))return;
  const {error}=await sb.rpc("delete_client_completely",{p_client_id:clientId});
  if(error){alert("Could not delete client: "+error.message);return;}
  $("detailDialog").close();await load();
};

window.logSession=async clientId=>{
  const msg=$("sessionMsg");if(msg)msg.textContent="Saving...";
  const packageId=$("sessionPackage")?.value;
  if(!packageId){if(msg)msg.textContent="Please add/select a package first.";return;}
  const p=packages.find(x=>x.id===packageId);
  if(!p){if(msg)msg.textContent="Package not found.";return;}
  if(remainingForPackage(p)<=0){if(msg)msg.textContent="This package has no remaining sessions.";return;}
  const {data:{user}}=await sb.auth.getUser();
  const dateValue=$("sessionDate").value, notesValue=$("sessionNotes").value.trim()||null;
  if(!dateValue){if(msg)msg.textContent="Please choose a date.";return;}
  const {error}=await sb.from("sessions").insert({user_id:user.id,client_id:clientId,package_id:packageId,session_date:new Date(dateValue+"T12:00:00").toISOString(),notes:notesValue});
  if(error){if(msg)msg.textContent=error.message;return;}
  await load(); if($("detailDialog").open){$("detailDialog").close();detail(clientId);}
};

start();
