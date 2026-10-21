const C = window.PTRR_CONFIG || {};
const sb = C.supabaseUrl && C.supabasePublishableKey && !C.supabasePublishableKey.includes("PASTE_") && window.supabase
  ? window.supabase.createClient(C.supabaseUrl, C.supabasePublishableKey)
  : null;

const $ = id => document.getElementById(id);
let mode = "login";
let clients = [];
let sessions = [];
let packages = [];
let prospects = [];
let activeClientId = null;
let activePackageId = null;
let activeProspectId = null;
let activeSessionId = null;
let clientTab = "active";
let baseMonthlySalary = 0;
let calendarDate = new Date();
let salaryDate = new Date();
let calendarDayKey = null;

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
  { value: "complimentary_session", label: "Complimentary session", sessions: 1, monthly: false },
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
  "complimentary_session": 0,
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

const COMMISSION_BANDS = [
  { min: 0, max: 79, rate: 25 },
  { min: 80, max: 89, rate: 32 },
  { min: 90, max: 99, rate: 33.5 },
  { min: 100, max: 109, rate: 37.5 },
  { min: 110, max: 119, rate: 39 },
  { min: 120, max: Infinity, rate: 43 }
];

function commissionRateFor(sessionsCount) {
  const band = COMMISSION_BANDS.find(b => sessionsCount >= b.min && sessionsCount <= b.max);
  return band ? band.rate : 0;
}

function calculateIncomeTax(annualGross) {
  const personalAllowance = 12570;
  const taxable = Math.max(0, annualGross - personalAllowance);
  const basic = Math.min(taxable, 37700);
  const higher = Math.min(Math.max(taxable - 37700, 0), 87440);
  const additional = Math.max(taxable - 125140, 0);
  return basic * 0.20 + higher * 0.40 + additional * 0.45;
}

function calculateEmployeeNI(annualGross) {
  const primaryThreshold = 12570;
  const upperEarningsLimit = 50270;
  const mainBand = Math.min(Math.max(annualGross - primaryThreshold, 0), upperEarningsLimit - primaryThreshold);
  const upperBand = Math.max(annualGross - upperEarningsLimit, 0);
  return mainBand * 0.08 + upperBand * 0.02;
}

function monthSessionsForDate(date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  return sessions.filter(s => {
    const d = new Date(s.session_date);
    return d.getFullYear() === y && d.getMonth() === m;
  });
}

function salaryPrediction(forDate = salaryDate) {
  const monthSessions = monthSessionsForDate(forDate).length;
  const rate = commissionRateFor(monthSessions);
  const commission = monthSessions * rate;
  const baseMonthly = Math.max(0, Number(baseMonthlySalary || 0));
  const grossMonthly = baseMonthly + commission;
  const annualGross = grossMonthly * 12;
  const annualTax = calculateIncomeTax(annualGross);
  const annualNI = calculateEmployeeNI(annualGross);
  const monthlyTax = annualTax / 12;
  const monthlyNI = annualNI / 12;
  const takeHome = Math.max(0, grossMonthly - monthlyTax - monthlyNI);
  return { monthSessions, rate, commission, baseMonthly, grossMonthly, monthlyTax, monthlyNI, takeHome };
}

function renderSalaryPrediction() {
  const box = $('salaryPrediction');
  if (!box) return;
  const p = salaryPrediction(salaryDate);
  const monthLabel = salaryDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const nextBand = COMMISSION_BANDS.find(b => p.monthSessions < b.min);
  const progressText = nextBand
    ? `Next rate: ${money(nextBand.rate)}/session at ${nextBand.min} sessions`
    : 'Top rate reached';

  box.innerHTML = `
    <div class="head salary-head">
      <div><div class="eyebrow">SALARY PREDICTION</div><h2>${monthLabel}</h2></div>
      <div class="salary-controls">
        <button id="salaryPrev" class="ghost small" type="button">‹</button>
        <button id="salaryToday" class="ghost small" type="button">Today</button>
        <button id="salaryNext" class="ghost small" type="button">›</button>
        <div class="salary-input"><label>Base monthly salary (£)<input id="baseSalary" type="number" min="0" step="100" value="0"></label></div>
      </div>
    </div>
    <div class="salary-grid">
      <div class="salary-metric"><div class="l">SESSIONS BOOKED</div><div class="v">${p.monthSessions}</div><div class="meta">All clients combined in ${monthLabel}</div></div>
      <div class="salary-metric"><div class="l">COMMISSION RATE</div><div class="v">${money(p.rate)}</div><div class="meta">${progressText}</div></div>
      <div class="salary-metric"><div class="l">GROSS COMMISSION</div><div class="v">${money(p.commission)}</div><div class="meta">${p.monthSessions} × ${money(p.rate)}</div></div>
      <div class="salary-metric"><div class="l">EST. TAX</div><div class="v">${money(p.monthlyTax)}</div><div class="meta">2026/27 PAYE estimate</div></div>
      <div class="salary-metric"><div class="l">EST. NATIONAL INSURANCE</div><div class="v">${money(p.monthlyNI)}</div><div class="meta">Employee Class 1</div></div>
      <div class="salary-metric highlight"><div class="l">EST. TAKE-HOME</div><div class="v">${money(p.takeHome)}</div><div class="meta">Gross salary less estimated tax + NI</div></div>
    </div>
    <div class="salary-note">Estimate assumes England PAYE, standard £12,570 Personal Allowance, no pension or student-loan deductions, and treats this month's gross as your monthly pay repeated for 12 months. Actual payslip tax can differ.</div>
  `;
  const input = $('baseSalary');
  if (input) {
    input.value = baseMonthlySalary;
    input.oninput = () => {
      baseMonthlySalary = Math.max(0, Number(input.value || 0));
      renderSalaryPrediction();
    };
  }
  $('salaryPrev').onclick = () => {
    salaryDate = new Date(salaryDate.getFullYear(), salaryDate.getMonth()-1, 1);
    renderSalaryPrediction();
  };
  $('salaryNext').onclick = () => {
    salaryDate = new Date(salaryDate.getFullYear(), salaryDate.getMonth()+1, 1);
    renderSalaryPrediction();
  };
  $('salaryToday').onclick = () => {
    const now = new Date();
    salaryDate = new Date(now.getFullYear(), now.getMonth(), 1);
    renderSalaryPrediction();
  };
}

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
  const opportunity = ps.reduce((sum, p) => sum + remainingForPackage(p) * packagePrice(p.package), 0);
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


function dateKeyLocal(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function calendarSessionsForDay(key) {
  return sessions
    .filter(s => dateKeyLocal(s.session_date) === key)
    .sort((a,b) => new Date(a.session_date) - new Date(b.session_date));
}

function renderCalendar() {
  const grid = $("calendarGrid");
  const monthLabel = $("calendarMonth");
  const monthView = $("calendarMonthView");
  const dayView = $("calendarDayView");
  if (!grid || !monthLabel) return;

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  monthLabel.textContent = new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  if (calendarDayKey) {
    if (monthView) monthView.classList.add("hide");
    if (dayView) dayView.classList.remove("hide");
    renderCalendarDay(calendarDayKey);
    return;
  }

  if (monthView) monthView.classList.remove("hide");
  if (dayView) dayView.classList.add("hide");

  const firstDay = new Date(year, month, 1);
  const leading = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const todayKey = dateKeyLocal(new Date());
  const clientMap = new Map(clients.map(c => [c.id, c]));
  const cells = [];

  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(d => {
    cells.push(`<div class="calendar-weekday">${d}</div>`);
  });

  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - leading + 1;
    let cellDate, outside = false;

    if (dayOffset < 1) {
      const prevMonthDays = new Date(year, month, 0).getDate();
      cellDate = new Date(year, month - 1, prevMonthDays + dayOffset);
      outside = true;
    } else if (dayOffset > daysInMonth) {
      cellDate = new Date(year, month + 1, dayOffset - daysInMonth);
      outside = true;
    } else {
      cellDate = new Date(year, month, dayOffset);
    }

    const key = dateKeyLocal(cellDate);
    const daySessions = calendarSessionsForDay(key);

    const sessionHtml = daySessions.slice(0,5).map(s => {
      const client = clientMap.get(s.client_id);
      const name = client ? client.name : "Unknown client";
      const time = new Date(s.session_date).toLocaleTimeString("en-GB", {hour:"2-digit", minute:"2-digit"});
      return `<button type="button" class="calendar-session" onclick="event.stopPropagation();detail('${s.client_id}')" title="${esc(name)} — ${time}">
        <span class="calendar-session-time">${time}</span><span class="calendar-session-name">${esc(name)}</span>
      </button>`;
    }).join("");

    const more = daySessions.length > 5 ? `<div class="calendar-more">+${daySessions.length - 5} more</div>` : "";

    cells.push(`
      <div class="calendar-day${outside ? " outside" : ""}${key === todayKey ? " today" : ""}" role="button" tabindex="0" onclick="openCalendarDay('${key}')" onkeydown="if(event.key==='Enter'||event.key===' ')openCalendarDay('${key}')">
        <div class="calendar-day-number">${cellDate.getDate()}</div>
        <div class="calendar-sessions">${sessionHtml}</div>
        ${more}
      </div>
    `);
  }

  grid.innerHTML = cells.join("");
}

function renderCalendarDay(key) {
  const title = $("calendarDayTitle");
  const body = $("calendarDayBody");
  if (!title || !body) return;

  const d = new Date(`${key}T12:00:00`);
  title.textContent = d.toLocaleDateString("en-GB", {
    weekday:"short", day:"numeric", month:"long", year:"numeric"
  });

  const clientMap = new Map(clients.map(c => [c.id, c]));
  const daySessions = calendarSessionsForDay(key);
  const rows = [];

  for (let hour = 5; hour <= 23; hour++) {
    const hourSessions = daySessions.filter(s => new Date(s.session_date).getHours() === hour);
    const time = `${String(hour).padStart(2,"0")}:00`;

    const content = hourSessions.map(session => {
      const client = clientMap.get(session.client_id);
      const name = client?.name || "Unknown client";
      const exact = new Date(session.session_date).toLocaleTimeString("en-GB", {hour:"2-digit", minute:"2-digit"});
      return `<button type="button" class="day-session-block" onclick="detail('${session.client_id}')">
        <span>${esc(name)}</span><small>${exact}</small>
      </button>`;
    }).join("");

    rows.push(`<div class="day-hour-row"><div class="day-hour-label">${time}</div><div class="day-hour-slot">${content}</div></div>`);
  }

  body.innerHTML = daySessions.length
    ? rows.join("")
    : `<div class="empty day-empty">No sessions booked on this day.</div>`;
}

window.openCalendarDay = key => {
  calendarDayKey = key;
  const d = new Date(`${key}T12:00:00`);
  calendarDate = new Date(d.getFullYear(), d.getMonth(), 1);
  renderCalendar();
};

window.closeCalendarDay = () => {
  calendarDayKey = null;
  renderCalendar();
};

function render() {
  const analysed = clients.map(c => ({ c, x: analyse(c) }));
  const risk = analysed.filter(x => x.x.score >= 3);
  const opportunity = analysed.reduce((sum, x) => sum + x.x.opp, 0);
  const totalRemainingSessions = analysed.reduce((sum, x) => sum + x.x.remaining, 0);

  const stats = $("stats");
  if (stats) {
    stats.innerHTML = [
      ["CLIENTS", clients.length],
      ["AT RISK", risk.length],
      ["FOLLOW-UPS", analysed.filter(x => x.x.score > 0).length],
      ["REMAINING SESSIONS", totalRemainingSessions],
      ["REVENUE OPPORTUNITY", money(opportunity)]
    ].map(x => `<div class="stat"><div class="l">${x[0]}</div><div class="v">${x[1]}</div></div>`).join("");
  }

  const ranked = analysed.filter(x => x.x.score > 0)
    .sort((a,b) => b.x.score - a.x.score || b.x.opp - a.x.opp);
  const priorityList = $("priorityList");
  if (priorityList) {
    priorityList.innerHTML = ranked.length
      ? ranked.slice(0, 8).map(({c,x}) => card(c,x)).join("")
      : `<div class="empty">No urgent opportunities right now. Nice work.</div>`;
  }

  renderClients();
  renderProspects();
  renderSalaryPrediction();
  renderCalendar();
}

function clientStatus(c) {
  const x = analyse(c);
  if (x.packageCount > 0 && x.remaining > 0) return "active";
  return "not_active";
}

function renderClients() {
  const listEl = $("clientList");
  if (!listEl) return;
  const q = ($("clientSearch")?.value || "").toLowerCase();
  const filtered = clients.filter(c => {
    const status = clientStatus(c);
    const matchesTab = clientTab === "active" ? status === "active" : status === "not_active";
    const hay = `${c.name || ""} ${c.phone || ""} ${c.email || ""}`.toLowerCase();
    return matchesTab && hay.includes(q);
  });
  listEl.innerHTML = filtered.length
    ? filtered.map(c => card(c, analyse(c))).join("")
    : `<div class="empty">${clientTab === "active" ? "No active clients found." : "No inactive clients found."}</div>`;

  $("activeClientCount")?.replaceChildren(document.createTextNode(String(clients.filter(c => clientStatus(c) === "active").length)));
  $("notActiveClientCount")?.replaceChildren(document.createTextNode(String(clients.filter(c => clientStatus(c) === "not_active").length)));
  document.querySelectorAll("[data-client-tab]").forEach(btn => btn.classList.toggle("active", btn.dataset.clientTab === clientTab));
}

function renderProspects() {
  const wrap = $("prospectList");
  if (!wrap) return;
  const rows = prospects.filter(p => !p.converted_at);
  if (!rows.length) {
    wrap.innerHTML = `<div class="empty">No prospect clients yet. Add your first lead from your Fitness Manager.</div>`;
    return;
  }
  wrap.innerHTML = rows.map(pr => {
    const contacted = !!pr.contacted_at;
    const when = contacted ? new Date(pr.contacted_at).toLocaleString("en-GB", {dateStyle:"medium", timeStyle:"short"}) : "Not contacted yet";
    return `<div class="prospect-row">
      <div class="prospect-main"><div class="name">${esc(pr.name)}</div><div class="meta">${esc(pr.email)}${pr.phone ? ` · ${esc(pr.phone)}` : ""} · ${esc(pr.source || "Fitness Manager")}</div><div class="meta">${contacted ? `Contacted ${esc(when)}` : "Not contacted yet"}</div>${pr.notes ? `<div class="why">${esc(pr.notes)}</div>` : ""}</div>
      <div class="actions prospect-actions"><button class="ghost small" onclick="toggleProspectContact('${pr.id}')">${contacted ? "Update contact" : "Mark contacted"}</button><button class="primary small" onclick="convertProspect('${pr.id}')">Add package & convert</button><button class="ghost small danger" onclick="deleteProspect('${pr.id}')">Delete</button></div>
    </div>`;
  }).join("");
}

function card(c, x) {
  return `<div class="client">
    <div>
      <div class="name">${esc(c.name)} ${x.score ? `<span class="badge">${x.score >= 4 ? "Priority" : "Follow-up"}</span>` : ""}</div>
      <div class="meta">${x.packageCount} package${x.packageCount === 1 ? "" : "s"} · ${x.remaining} sessions remaining · ${x.monthly} this month${c.lead_source ? ` · ${esc(c.lead_source)}` : ""}${x.packageCount === 0 ? " · No package yet" : ""}</div>
      ${x.reasons.length ? `<div class="why"><b>Why:</b> ${esc(x.reasons.join(" · "))}</div>` : ""}
    </div>
    <div class="actions">
      <button class="ghost small" onclick="detail('${c.id}')">View</button>
    </div>
  </div>`;
}

async function load() {
  if (!sb) return;
  const clientsResult = await sb.from("clients").select("*").order("created_at", { ascending: false });
  if (clientsResult.error) {
    console.error(clientsResult.error);
    return;
  }

  clients = clientsResult.data || [];
  const clientIds = clients.map(c => c.id);
  sessions = [];
  packages = [];
  prospects = [];

  const prospectResult = await sb.from("prospects").select("*").is("converted_at", null).order("created_at", { ascending: false });
  if (!prospectResult.error) prospects = prospectResult.data || [];
  else console.error(prospectResult.error);

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

function showAuth() {
  $("authView").classList.remove("hide");
  $("appView").classList.add("hide");
  $("authForm")?.classList.remove("hide");
  $("resetPasswordForm")?.classList.add("hide");
}

function showResetPassword() {
  $("authView").classList.remove("hide");
  $("appView").classList.add("hide");
  $("authForm")?.classList.add("hide");
  $("resetPasswordForm")?.classList.remove("hide");
  $("resetMsg").textContent = "";
}

function authRedirectUrl() {
  return window.location.origin + window.location.pathname;
}

async function setAccountBrand(user) {
  let name = user?.user_metadata?.full_name?.trim() || "";
  if (!name && sb && user?.id) {
    try {
      const { data } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      name = data?.full_name?.trim() || "";
    } catch (e) {
      console.warn("Could not load profile name", e);
    }
  }
  if (!name) {
    const local = String(user?.email || "").split("@")[0].replace(/[._-]+/g, " ").trim();
    name = local ? local.replace(/\b\w/g, ch => ch.toUpperCase()) : "Account";
  }
  const brand = `${name} Tracker`;
  document.querySelectorAll("[data-brand-name]").forEach(el => { el.textContent = brand; });
  document.title = brand;
}

function showApp(s) {
  $("authView").classList.add("hide");
  $("appView").classList.remove("hide");
  $("userEmail").textContent = s.user.email || "";
  setAccountBrand(s.user);
  showPage("dashboard");
  load();
}

async function start() {
  if (!sb) { showAuth(); $("authMsg").textContent = "Add your Publishable key to config.js first."; return; }
  const { data: { session } } = await sb.auth.getSession();
  session ? showApp(session) : showAuth();
  sb.auth.onAuthStateChange((event, s) => {
    if (event === "PASSWORD_RECOVERY") {
      showResetPassword();
      return;
    }
    if (s) showApp(s); else showAuth();
  });

  // Supabase may return to the app with a recovery hash before the auth event fires.
  if (window.location.hash.includes("type=recovery")) showResetPassword();
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

$("forgotPasswordBtn").onclick = async () => {
  if (!sb) return;
  const email = $("email").value.trim();
  $("authMsg").textContent = "";
  if (!email) {
    $("authMsg").textContent = "Enter your email address first.";
    $("email").focus();
    return;
  }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
  $("authMsg").textContent = error
    ? error.message
    : "If an account exists for this email, you will receive a password reset email shortly.";
};

$("resetPasswordForm").onsubmit = async e => {
  e.preventDefault();
  if (!sb) return;
  const password = $("newPassword").value;
  const confirm = $("confirmPassword").value;
  $("resetMsg").textContent = "";
  if (password !== confirm) {
    $("resetMsg").textContent = "Passwords do not match.";
    return;
  }
  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    $("resetMsg").textContent = error.message;
    return;
  }
  $("resetMsg").textContent = "Password updated successfully. You can now log in with your new password.";
  setTimeout(async () => {
    await sb.auth.signOut();
    window.location.hash = "";
    showAuth();
  }, 900);
};

$("logoutBtn").onclick=()=>sb.auth.signOut();

const PAGE_META = {
  dashboard: { title: "Dashboard" },
  clients: { title: "Clients" },
  prospects: { title: "Prospect Clients" },
  salary: { title: "Salary Calculator" },
  calendar: { title: "Sessions Calendar" }
};

function closeMenu() {
  $("sideMenu")?.classList.remove("open");
  $("menuBackdrop")?.classList.add("hide");
}

function openMenu() {
  $("sideMenu")?.classList.add("open");
  $("menuBackdrop")?.classList.remove("hide");
}

function showPage(page) {
  const pages = { dashboard: $("dashboardPage"), clients: $("clientsPage"), clientDetail: $("clientDetailPage"), packageDetail: $("packageDetailPage"), prospects: $("prospectsPage"), salary: $("salaryPage"), calendar: $("calendarPage") };
  Object.entries(pages).forEach(([key, el]) => { if (el) el.classList.toggle("hide", key !== page); });
  document.querySelectorAll(".menu-item").forEach(btn => btn.classList.toggle("active", btn.dataset.page === page));
  const meta = PAGE_META[page] || PAGE_META.dashboard;
  if ($("pageTitle")) $("pageTitle").textContent = meta.title;
  closeMenu();
  if (page === "clients") renderClients();
  if (page === "clientDetail" && activeClientId) renderClientDetail(activeClientId);
  if (page === "packageDetail" && activePackageId) renderPackageDetail(activePackageId);
  if (page === "prospects") renderProspects();
  if (page === "salary") renderSalaryPrediction();
  if (page === "calendar") renderCalendar();
}

document.querySelectorAll(".menu-item").forEach(btn => { btn.onclick = () => showPage(btn.dataset.page); });
$("menuBtn").onclick = openMenu;
$("closeMenu").onclick = closeMenu;
$("menuBackdrop").onclick = closeMenu;

$("calendarPrev").onclick=()=>{ calendarDayKey=null; calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth()-1, 1); renderCalendar(); };
$("calendarNext").onclick=()=>{ calendarDayKey=null; calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth()+1, 1); renderCalendar(); };
$("calendarToday").onclick=()=>{ const now=new Date(); calendarDayKey=null; calendarDate=new Date(now.getFullYear(),now.getMonth(),1); renderCalendar(); };
$("calendarBackMonth").onclick=()=>{ calendarDayKey=null; renderCalendar(); };
$("clientSearch")?.addEventListener("input", renderClients);
$("addClientBtn")?.addEventListener("click", () => { $("clientForm").reset(); $("clientDialog").showModal(); });
$("closeDialog").onclick=()=>$('clientDialog').close();
document.querySelectorAll("[data-client-tab]").forEach(btn => btn.addEventListener("click", () => { clientTab = btn.dataset.clientTab; renderClients(); }));
$("addProspectBtn")?.addEventListener("click", () => { $("prospectForm").reset(); $("prospectMsg").textContent=""; $("prospectDialog").showModal(); });
$("closeProspectDialog")?.addEventListener("click", () => $("prospectDialog").close());
$("exportProspectsBtn")?.addEventListener("click", exportProspectsCsv);
$("importProspectsBtn")?.addEventListener("click", () => $("prospectImportFile")?.click());
$("prospectImportFile")?.addEventListener("change", handleProspectImport);

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

$("prospectForm").onsubmit=async e=>{
  e.preventDefault();
  const {data:{user}}=await sb.auth.getUser();
  const payload={user_id:user.id,name:$("prName").value.trim(),email:$("prEmail").value.trim(),phone:$("prPhone").value.trim()||null,source:"Fitness Manager",notes:$("prNotes").value.trim()||null};
  const {error}=await sb.from("prospects").insert(payload);
  if(error){$("prospectMsg").textContent=error.message;return;}
  $("prospectDialog").close(); await load(); showPage("prospects");
};

async function handleProspectImport(e){
  const file=e.target.files?.[0];
  if(!file)return;
  const input=e.target;
  try{
    const buf=await file.arrayBuffer();
    let rows=[];
    const lower=file.name.toLowerCase();
    if(lower.endsWith(".csv")){
      const text=new TextDecoder("utf-8").decode(buf);
      rows=parseCsv(text);
    }else{
      if(!window.XLSX) throw new Error("Spreadsheet reader is still loading. Please try again.");
      const wb=XLSX.read(buf,{type:"array"});
      const ws=wb.Sheets[wb.SheetNames[0]];
      rows=XLSX.utils.sheet_to_json(ws,{defval:""});
    }
    const normalised=normaliseProspectRows(rows);
    if(!normalised.length){
      alert("No valid prospects found. The spreadsheet needs Name and Email columns.");
      return;
    }
    const existingEmails=new Set(prospects.filter(p=>!p.converted_at).map(p=>String(p.email||"").trim().toLowerCase()).filter(Boolean));
    const {data:{user}}=await sb.auth.getUser();
    const unique=[];
    const seen=new Set(existingEmails);
    for(const row of normalised){
      const email=row.email.toLowerCase();
      if(seen.has(email)) continue;
      seen.add(email);
      unique.push({user_id:user.id,name:row.name,email:row.email,phone:row.phone||null,source:"Fitness Manager",notes:row.notes||null});
    }
    if(!unique.length){
      alert("No new prospects were imported. All emails already exist in your prospect list.");
      return;
    }
    let inserted=0;
    for(let i=0;i<unique.length;i+=100){
      const chunk=unique.slice(i,i+100);
      const {error}=await sb.from("prospects").insert(chunk);
      if(error) throw error;
      inserted+=chunk.length;
    }
    await load();
    showPage("prospects");
    alert(`${inserted} prospect${inserted===1?"":"s"} imported successfully.`);
  }catch(err){
    console.error(err);
    alert("Could not import the spreadsheet: "+(err?.message||err));
  }finally{
    input.value="";
  }
}

function normaliseProspectRows(rows){
  return (rows||[]).map(row=>{
    const keys=Object.keys(row||{});
    const find=(names)=>{
      const key=keys.find(k=>names.includes(String(k).trim().toLowerCase()));
      return key==null?"":String(row[key]??"").trim();
    };
    const name=find(["name","full name","full_name","client name","client"]);
    const email=find(["email","e-mail","email address","email_address"]);
    const phone=find(["phone","telephone","mobile","phone number"]);
    const notes=find(["notes","note"]);
    return {name,email,phone,notes};
  }).filter(r=>r.name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
}

function parseCsv(text){
  const lines=[]; let row=[]; let cell=""; let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i], next=text[i+1];
    if(quoted){
      if(ch==='"' && next==='"'){cell+='"';i++;}
      else if(ch==='"') quoted=false;
      else cell+=ch;
    }else if(ch==='"') quoted=true;
    else if(ch===','){row.push(cell);cell="";}
    else if(ch==='\n'){row.push(cell);lines.push(row);row=[];cell="";}
    else if(ch!=='\r') cell+=ch;
  }
  if(cell!=="" || row.length){row.push(cell);lines.push(row);}
  if(!lines.length)return [];
  const headers=lines[0].map(x=>String(x).trim());
  return lines.slice(1).filter(r=>r.some(x=>String(x).trim())).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??""])));
}

function exportProspectsCsv(){
  const rows=prospects.filter(p=>!p.converted_at);
  const header=["Name","Email","Phone","Source","Contacted","Contacted At"];
  const csv=[header,...rows.map(p=>[p.name,p.email,p.phone||"",p.source||"Fitness Manager",p.contacted_at?"Yes":"No",p.contacted_at?new Date(p.contacted_at).toLocaleString("en-GB"):""])].map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`prospect-clients-${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

window.toggleProspectContact=async id=>{
  const p=prospects.find(x=>x.id===id); if(!p)return;
  const next=new Date().toISOString();
  const {error}=await sb.from("prospects").update({contacted_at:next}).eq("id",id);
  if(error){alert(error.message);return;} await load(); showPage("prospects");
};

window.deleteProspect=async id=>{
  const p=prospects.find(x=>x.id===id); if(!p)return;
  if(!confirm(`Delete prospect ${p.name}?\n\nThis cannot be undone.`))return;
  const {error}=await sb.from("prospects").delete().eq("id",id);
  if(error){alert(error.message);return;} await load(); showPage("prospects");
};

window.convertProspect=id=>{
  const p=prospects.find(x=>x.id===id); if(!p)return;
  activeProspectId=id;
  $("convertProspectName").textContent=p.name;
  $("prospectPackageForm").reset();
  $("prPackagePurchasedAt").value=new Date().toISOString().slice(0,10);
  $("prospectPackageMsg").textContent="";
  $("prospectPackageDialog").showModal();
};

$("closeProspectPackageDialog")?.addEventListener("click",()=>$("prospectPackageDialog").close());
const prospectPackageSelect=$("prPackage");
prospectPackageSelect?.addEventListener("change",()=>{
  const value=prospectPackageSelect.value, info=packageInfo(value), price=packagePrice(value);
  if($("prPackageValue")) $("prPackageValue").value=info?price.toFixed(2):"";
  if($("prPackageRate")) $("prPackageRate").textContent=info?`${info.sessions} session${info.sessions===1?"":"s"} · ${money(price/info.sessions)} per session`:"Select a package to calculate the price automatically.";
});

$("prospectPackageForm").onsubmit=async e=>{
  e.preventDefault();
  const p=prospects.find(x=>x.id===activeProspectId); if(!p)return;
  const opt=$("prPackage").selectedOptions[0]; if(!opt)return;
  const {data:{user}}=await sb.auth.getUser();
  const {data:client,error:clientError}=await sb.from("clients").insert({user_id:user.id,name:p.name,email:p.email,phone:p.phone||null,lead_source:"Fitness Manager",lead:true,notes:p.notes||null}).select().single();
  if(clientError){$("prospectPackageMsg").textContent=clientError.message;return;}
  const {error:packageError}=await sb.from("packages").insert({user_id:user.id,client_id:client.id,package:$("prPackage").value,package_sessions:Number(opt.dataset.sessions||0),package_value:packagePrice($("prPackage").value),monthly:opt.dataset.monthly==="true",purchased_at:new Date($("prPackagePurchasedAt").value+"T12:00:00").toISOString()});
  if(packageError){await sb.from("clients").delete().eq("id",client.id);$("prospectPackageMsg").textContent=packageError.message;return;}
  const {error:prospectError}=await sb.from("prospects").update({converted_client_id:client.id,converted_at:new Date().toISOString()}).eq("id",p.id);
  if(prospectError){$("prospectPackageMsg").textContent=prospectError.message;return;}
  $("prospectPackageDialog").close(); activeProspectId=null; await load(); showPage("clients"); clientTab="active"; renderClients(); detail(client.id);
};

function packageRemainingLabel(p) { return `${remainingForPackage(p)} remaining`; }

function packageRemainingLabel(p) { return `${remainingForPackage(p)} remaining`; }

function renderClientDetail(id) {
  const c = clients.find(x => x.id === id);
  if (!c) return;
  activeClientId = id;
  const x = analyse(c), ps = packagesForClient(c.id);
  const packageRows = ps.length ? ps.map(p => {
    const remaining = remainingForPackage(p);
    const clickable = remaining > 0;
    return `<div class="package-card ${clickable ? "package-clickable" : "package-inactive"}" ${clickable ? `onclick="openPackage('${p.id}')" role="button" tabindex="0"` : ""}>
      <div class="package-card-main">
        <div class="name">${esc(packageInfo(p.package)?.label || p.package)}</div>
        <div class="meta">${money(packagePrice(p.package))} · Purchased ${new Date(p.purchased_at).toLocaleDateString("en-GB")} · ${packageRemainingLabel(p)}</div>
        ${clickable ? `<div class="package-link-hint">Open package → book & view sessions</div>` : `<div class="package-link-hint muted">Package completed</div>`}
      </div>
      <button class="ghost small danger package-delete-btn" onclick="event.stopPropagation(); deletePackage('${p.id}')">Delete package</button>
    </div>`;
  }).join("") : `<div class="empty">No packages purchased yet.</div>`;

  $("pageTitle").textContent = c.name || "Client";
  $("clientDetailContent").innerHTML = `
    <div class="client-detail-top">
      <button class="ghost small" onclick="showPage('clients')">← Back to Clients</button>
      <div class="client-detail-actions">
        ${c.phone ? `<a class="ghost small" target="_blank" href="https://wa.me/${String(c.phone).replace(/\D/g,"")}">WhatsApp</a>` : ""}
        ${c.email ? `<a class="ghost small" href="mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent("PT follow-up")}&body=${encodeURIComponent("Hi " + ((c.name || "").trim().split(/\s+/)[0] || "there") + "\n\nI hope you\'re well.\n\nThank you\nGui")}">Email</a>` : ""}
        <button class="ghost small" onclick="toggleClientEdit()">Edit details</button>
        <button class="ghost small danger" onclick="deleteClient('${c.id}')">Delete client</button>
      </div>
    </div>

    <div class="client-hero">
      <div>
        <div class="eyebrow">CLIENT</div>
        <h2>${esc(c.name)}</h2>
        <div class="meta">${x.packageCount} package${x.packageCount===1?"":"s"} · ${x.remaining} sessions remaining · ${money(x.opp)} revenue opportunity</div>
      </div>
    </div>

    <div id="clientEditSection" class="client-edit-section hide">
      <div class="section-head"><h3>Edit personal details</h3></div>
      <form id="clientDetailsForm" class="client-details-form">
        <div class="grid">
          <label>Name<input id="detailName" required value="${esc(c.name || "")}"></label>
          <label>Phone<input id="detailPhone" value="${esc(c.phone || "")}" placeholder="+44..."></label>
          <label>Email<input id="detailEmail" type="email" value="${esc(c.email || "")}" placeholder="client@email.com"></label>
          <label>Lead source<select id="detailLeadSource">
            <option value="" ${!c.lead_source?"selected":""}>Not a lead / existing client</option>
            <option value="Web Inquiry" ${c.lead_source==="Web Inquiry"?"selected":""}>Web Inquiry</option>
            <option value="Gym Floor Interaction" ${c.lead_source==="Gym Floor Interaction"?"selected":""}>Gym Floor Interaction</option>
            <option value="PT Intro session" ${c.lead_source==="PT Intro session"?"selected":""}>PT Intro session</option>
            <option value="Birthday Session" ${c.lead_source==="Birthday Session"?"selected":""}>Birthday Session</option>
            <option value="Complimentary Session" ${c.lead_source==="Complimentary Session"?"selected":""}>Complimentary Session</option>
            <option value="Workshop lead" ${c.lead_source==="Workshop lead"?"selected":""}>Workshop lead</option>
            <option value="Point of Sales" ${c.lead_source==="Point of Sales"?"selected":""}>Point of Sales</option>
            <option value="Fitness Manager" ${c.lead_source==="Fitness Manager"?"selected":""}>Fitness Manager</option>
          </select></label>
        </div>
        <label>Notes<textarea id="detailNotes" rows="4">${esc(c.notes || "")}</textarea></label>
        <div id="detailEditMsg" class="msg"></div>
        <div class="actions"><button type="submit" class="primary">Save changes</button><button type="button" class="ghost" onclick="toggleClientEdit(false)">Cancel</button></div>
      </form>
    </div>

    <div class="client-info-grid">
      <div class="info-card"><div class="l">EMAIL</div><div class="v">${esc(c.email || "—")}</div></div>
      <div class="info-card"><div class="l">PHONE</div><div class="v">${esc(c.phone || "—")}</div></div>
      <div class="info-card"><div class="l">LEAD SOURCE</div><div class="v">${esc(c.lead_source || (c.lead ? "Lead" : "—"))}</div></div>
      <div class="info-card"><div class="l">NOTES</div><div class="v">${esc(c.notes || "—")}</div></div>
    </div>

    <div class="detail-section">
      <div class="section-head"><div><div class="eyebrow">PACKAGES</div><h3>Packages purchased</h3></div><button class="primary small" onclick="openAddPackage('${c.id}')">+ Add package</button></div>
      <div class="meta" style="margin-bottom:12px">Select an active package to book or view its sessions.</div>
      ${packageRows}
    </div>
  `;

  $("clientDetailsForm")?.addEventListener("submit", saveClientDetails);
}

function renderPackageDetail(packageId) {
  const p = packages.find(x => x.id === packageId);
  if (!p) { showPage("clientDetail"); return; }
  const c = clients.find(x => x.id === p.client_id);
  if (!c) { showPage("clients"); return; }
  activePackageId = packageId;
  activeClientId = c.id;
  const info = packageInfo(p.package);
  const remaining = remainingForPackage(p);
  const linkedSessions = sessions.filter(s => s.package_id === p.id).sort((a,b) => new Date(b.session_date) - new Date(a.session_date));
  const rows = linkedSessions.length ? linkedSessions.map(s => {
    const dt = new Date(s.session_date);
    return `<div class="session-row"><div><div class="name">${dt.toLocaleDateString("en-GB")} · ${dt.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</div>${s.notes ? `<div class="meta">${esc(s.notes)}</div>` : ""}</div><div class="actions"><button class="ghost small" onclick="openEditSession('${s.id}')">Edit</button><button class="ghost small danger" onclick="deleteSession('${s.id}', '${c.id}')">Delete</button></div></div>`;
  }).join("") : `<div class="empty">No sessions booked for this package yet.</div>`;

  $("pageTitle").textContent = info?.label || "Package";
  $("packageDetailContent").innerHTML = `
    <div class="client-detail-top">
      <button class="ghost small" onclick="showPage('clientDetail')">← Back to ${esc(c.name)}</button>
      <button class="ghost small danger" onclick="deletePackage('${p.id}')">Delete package</button>
    </div>
    <div class="client-hero package-hero">
      <div><div class="eyebrow">PACKAGE</div><h2>${esc(info?.label || p.package)}</h2><div class="meta">Client: ${esc(c.name)} · Purchased ${new Date(p.purchased_at).toLocaleDateString("en-GB")}</div></div>
    </div>
    <div class="package-summary-grid">
      <div class="info-card"><div class="l">PACKAGE VALUE</div><div class="v">${money(packagePrice(p.package))}</div></div>
      <div class="info-card"><div class="l">TOTAL SESSIONS</div><div class="v">${p.package_sessions}</div></div>
      <div class="info-card"><div class="l">SESSIONS BOOKED</div><div class="v">${linkedSessions.length}</div></div>
      <div class="info-card"><div class="l">SESSIONS REMAINING</div><div class="v">${remaining}</div></div>
    </div>
    <div class="detail-section">
      <div class="section-head"><div><div class="eyebrow">SESSIONS</div><h3>Book a session for this package</h3></div></div>
      ${remaining > 0 ? `<div class="session-datetime"><label>Date<input id="packageSessionDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>Time<input id="packageSessionTime" type="time" step="900" value="09:00" required></label></div>
      <div class="meta">The same time cannot be booked twice on the same day.</div>
      <label>Notes<textarea id="packageSessionNotes" rows="2" placeholder="Optional"></textarea></label>
      <div id="packageSessionMsg" class="msg"></div>
      <button class="primary" onclick="logPackageSession('${p.id}')">Book session</button>` : `<div class="empty">This package has no remaining sessions.</div>`}
    </div>
    <div class="detail-section"><div class="section-head"><div><div class="eyebrow">BOOKED SESSIONS</div><h3>Sessions for this package</h3></div></div>${rows}</div>
  `;
}

window.openPackage = packageId => {
  const p = packages.find(x => x.id === packageId);
  if (!p || remainingForPackage(p) <= 0) return;
  activePackageId = packageId;
  showPage("packageDetail");
};

window.logPackageSession = async packageId => {
  const msg = $("packageSessionMsg"); if (msg) msg.textContent = "Saving...";
  const p = packages.find(x => x.id === packageId);
  if (!p) { if(msg) msg.textContent = "Package not found."; return; }
  if (remainingForPackage(p) <= 0) { if(msg) msg.textContent = "This package has no remaining sessions."; return; }
  const dateValue = $("packageSessionDate")?.value, timeValue = $("packageSessionTime")?.value, notesValue = $("packageSessionNotes")?.value.trim() || null;
  if (!dateValue || !timeValue) { if(msg) msg.textContent = "Please choose a date and time."; return; }
  const sessionDateTime = new Date(`${dateValue}T${timeValue}:00`);
  if (Number.isNaN(sessionDateTime.getTime())) { if(msg) msg.textContent = "Please choose a valid date and time."; return; }
  const clash = sessions.find(s => new Date(s.session_date).getTime() === sessionDateTime.getTime());
  if (clash) {
    const clashClient = clients.find(c => c.id === clash.client_id);
    if(msg) msg.textContent = `That time is already booked with ${clashClient?.name || "another client"}. Please choose another time.`;
    return;
  }
  const { data:{user} } = await sb.auth.getUser();
  const { error } = await sb.from("sessions").insert({user_id:user.id, client_id:p.client_id, package_id:packageId, session_date:sessionDateTime.toISOString(), notes:notesValue});
  if(error) { if(msg) msg.textContent = error.message; return; }
  await load();
  renderPackageDetail(packageId);
};

window.detail = id => {
  activeClientId = id;
  showPage("clientDetail");
};

window.toggleClientEdit = (force) => {
  const section = $("clientEditSection");
  if (!section) return;
  const show = typeof force === "boolean" ? force : section.classList.contains("hide");
  section.classList.toggle("hide", !show);
};

window.saveClientDetails = async e => {
  e.preventDefault();
  if (!activeClientId) return;
  const msg = $("detailEditMsg");
  const payload = {
    name: $("detailName").value.trim(),
    phone: $("detailPhone").value.trim() || null,
    email: $("detailEmail").value.trim() || null,
    lead_source: $("detailLeadSource").value || null,
    lead: Boolean($("detailLeadSource").value),
    notes: $("detailNotes").value.trim() || null
  };
  if (!payload.name) { if(msg) msg.textContent = "Name is required."; return; }
  const { error } = await sb.from("clients").update(payload).eq("id", activeClientId);
  if (error) { if(msg) msg.textContent = error.message; return; }
  await load();
  renderClientDetail(activeClientId);
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
  $("packageDialog").close(); await load(); if(activeClientId) renderClientDetail(activeClientId);
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

const packageSelect = $("pPackage");
if (packageSelect) {
  packageSelect.addEventListener("change", () => {
    const value = packageSelect.value;
    const info = packageInfo(value);
    const price = packagePrice(value);
    if ($("pValue")) $("pValue").value = info ? price.toFixed(2) : "";
    if ($("pRate")) $("pRate").textContent = info ? `${info.sessions} session${info.sessions === 1 ? "" : "s"} · ${money(price / info.sessions)} per session` : "Select a package to calculate the price automatically.";
  });
}

window.deletePackage=async packageId=>{
  const p=packages.find(x=>x.id===packageId);
  if(!p)return;
  const linkedSessions=sessions.filter(s=>s.package_id===packageId);
  if(linkedSessions.length){
    alert(`This package has ${linkedSessions.length} recorded session${linkedSessions.length===1?"":"s"}. It cannot be deleted while sessions are linked to it.`);
    return;
  }
  const label=packageInfo(p.package)?.label||p.package;
  if(!confirm(`Delete the ${label} package purchased on ${new Date(p.purchased_at).toLocaleDateString("en-GB")}?\n\nThis cannot be undone.`))return;
  const {error}=await sb.from("packages").delete().eq("id",packageId);
  if(error){alert("Could not delete package: "+error.message);return;}
  await load();
  if (activePackageId === packageId) { activePackageId = null; showPage("clientDetail"); return; }
  if(activeClientId) renderClientDetail(activeClientId);
};

window.openEditSession = sessionId => {
  const s = sessions.find(x => x.id === sessionId);
  if (!s) return;
  activeSessionId = sessionId;
  const dt = new Date(s.session_date);
  const localDate = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  const localTime = `${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
  const client = clients.find(c => c.id === s.client_id);
  const p = packages.find(x => x.id === s.package_id);
  $("editSessionTitle").textContent = client?.name || "Session";
  $("editSessionPackage").textContent = p ? (packageInfo(p.package)?.label || p.package) : "Package";
  $("editSessionDate").value = localDate;
  $("editSessionTime").value = localTime;
  $("editSessionNotes").value = s.notes || "";
  $("editSessionMsg").textContent = "";
  $("editSessionDialog").showModal();
};

$("closeEditSessionDialog")?.addEventListener("click", () => {
  activeSessionId = null;
  $("editSessionDialog")?.close();
});

$("editSessionForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  if (!activeSessionId) return;
  const msg = $("editSessionMsg");
  msg.textContent = "Saving...";
  const s = sessions.find(x => x.id === activeSessionId);
  if (!s) { msg.textContent = "Session not found."; return; }
  const dateValue = $("editSessionDate").value;
  const timeValue = $("editSessionTime").value;
  const notesValue = $("editSessionNotes").value.trim() || null;
  if (!dateValue || !timeValue) { msg.textContent = "Please choose a date and time."; return; }
  const nextDateTime = new Date(`${dateValue}T${timeValue}:00`);
  if (Number.isNaN(nextDateTime.getTime())) { msg.textContent = "Please choose a valid date and time."; return; }
  const clash = sessions.find(x => x.id !== activeSessionId && new Date(x.session_date).getTime() === nextDateTime.getTime());
  if (clash) {
    const clashClient = clients.find(c => c.id === clash.client_id);
    msg.textContent = `That time is already booked with ${clashClient?.name || "another client"}. Please choose another time.`;
    return;
  }
  const { error } = await sb.from("sessions").update({ session_date: nextDateTime.toISOString(), notes: notesValue }).eq("id", activeSessionId);
  if (error) { msg.textContent = error.message; return; }
  const packageId = s.package_id;
  $("editSessionDialog").close();
  activeSessionId = null;
  await load();
  if (packageId && packages.some(p => p.id === packageId)) renderPackageDetail(packageId);
});

window.deleteSession=async (sessionId, clientId)=>{
  const s=sessions.find(x=>x.id===sessionId);
  if(!s)return;
  const dt=new Date(s.session_date);
  const date=dt.toLocaleDateString("en-GB");
  const time=dt.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
  if(!confirm(`Delete the session booked for ${date} at ${time}?\n\nThis will return the session to the package and cannot be undone.`))return;
  const {error}=await sb.from("sessions").delete().eq("id",sessionId);
  if(error){alert("Could not delete session: "+error.message);return;}
  await load();
  if (activePackageId && packages.some(p => p.id === activePackageId)) { renderPackageDetail(activePackageId); return; }
  if(activeClientId) renderClientDetail(clientId || activeClientId);
};

window.deleteClient=async clientId=>{
  const c=clients.find(x=>x.id===clientId);if(!c)return;
  if(!confirm(`Delete ${c.name} and all their sessions, packages and follow-ups?\n\nThis cannot be undone.`))return;
  const {error}=await sb.rpc("delete_client_completely",{p_client_id:clientId});
  if(error){alert("Could not delete client: "+error.message);return;}
  await load(); showPage("clients");
};

window.logSession=async clientId=>{
  const msg=$("sessionMsg");if(msg)msg.textContent="Saving...";
  const packageId=$("sessionPackage")?.value;
  if(!packageId){if(msg)msg.textContent="Please add/select a package first.";return;}
  const p=packages.find(x=>x.id===packageId);
  if(!p){if(msg)msg.textContent="Package not found.";return;}
  if(remainingForPackage(p)<=0){if(msg)msg.textContent="This package has no remaining sessions.";return;}
  const {data:{user}}=await sb.auth.getUser();
  const dateValue=$("sessionDate").value, timeValue=$("sessionTime")?.value, notesValue=$("sessionNotes").value.trim()||null;
  if(!dateValue){if(msg)msg.textContent="Please choose a date.";return;}
  if(!timeValue){if(msg)msg.textContent="Please choose a time.";return;}
  const sessionDateTime = new Date(`${dateValue}T${timeValue}:00`);
  if(Number.isNaN(sessionDateTime.getTime())){if(msg)msg.textContent="Please choose a valid date and time.";return;}
  const clash = sessions.find(s => new Date(s.session_date).getTime() === sessionDateTime.getTime());
  if(clash){
    const clashClient = clients.find(c => c.id === clash.client_id);
    const clashName = clashClient?.name || "another client";
    if(msg)msg.textContent=`That time is already booked with ${clashName}. Please choose another time.`;
    return;
  }
  const {error}=await sb.from("sessions").insert({user_id:user.id,client_id:clientId,package_id:packageId,session_date:sessionDateTime.toISOString(),notes:notesValue});
  if(error){if(msg)msg.textContent=error.message;return;}
  await load(); renderClientDetail(clientId);
};

start();
