const STORAGE_KEY = "ptrr_final_v1";

const seedClients = [
  {id:1,name:"Sarah",phone:"",value:180,frequency:3,sessions:1,days:17,remaining:2,lead:"no",followUp:0,lastContact:4,notes:"Usually trains 3x/month. Has gone quiet recently."},
  {id:2,name:"John",phone:"",value:300,frequency:4,sessions:3,days:6,remaining:1,lead:"no",followUp:0,lastContact:9,notes:"Package nearly finished. Strong renewal potential."},
  {id:3,name:"Emma",phone:"",value:240,frequency:3,sessions:1,days:11,remaining:4,lead:"no",followUp:2,lastContact:3,notes:"Frequency has dropped from target."},
  {id:4,name:"Mike",phone:"",value:150,frequency:2,sessions:0,days:30,remaining:0,lead:"yes",followUp:0,lastContact:8,notes:"New lead. Needs first follow-up."}
];

let clients = load();
let activeFilter = "all";
let searchTerm = "";

const $ = s => document.querySelector(s);
const money = n => "£" + Math.round(Number(n)||0).toLocaleString("en-GB");
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const initials = n => n.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();

function load(){
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : structuredClone(seedClients);
  } catch { return structuredClone(seedClients); }
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(clients)); }

function analyse(c){
  const reasons = [];
  const actions = [];
  let score = 0;
  let opportunity = Number(c.value)||0;

  if(c.lead === "yes"){
    score += 50; reasons.push(["New lead","danger"]); actions.push("Follow up with this lead today");
    opportunity = Math.max(opportunity, Number(c.value)||0);
  }
  if(Number(c.remaining) <= 1 && c.lead !== "yes"){
    score += 40; reasons.push(["Package nearly finished","warn"]); actions.push("Start renewal conversation");
  }
  if(Number(c.remaining) === 0 && c.lead !== "yes"){
    score += 20; reasons.push(["Package finished","danger"]); actions.push("Get the next sessions booked");
  }
  if(Number(c.days) >= 14){
    score += 35; reasons.push([`${c.days} days inactive`,"danger"]); actions.push("Reconnect and get next session booked");
  } else if(Number(c.days) >= 7){
    score += 15; reasons.push([`${c.days} days since session`,"warn"]); actions.push("Check in and rebook");
  }
  const target = Math.max(1, Number(c.frequency)||1);
  const actual = Number(c.sessions)||0;
  if(actual < target){
    const pct = Math.round((1 - actual/target)*100);
    if(pct >= 30){
      score += 25; reasons.push([`${pct}% below target frequency`,"danger"]); actions.push("Address the frequency drop");
    }
  }
  if(Number(c.followUp) === 0){
    score += 20; reasons.push(["Follow-up due","warn"]); actions.push("Follow up today");
  } else if(Number(c.followUp) <= 2){
    score += 8; reasons.push(["Follow-up soon","warn"]);
  }
  if(!reasons.length){
    reasons.push(["Healthy","ok"]);
  }

  let type = "rebook";
  if(c.lead === "yes") type = "lead";
  else if(Number(c.remaining) <= 1) type = "renewal";
  else if(Number(c.days) >= 14 || actual < target) type = "at-risk";
  else if(Number(c.followUp) <= 2) type = "follow-up";

  const priority = score >= 70 ? "High" : score >= 35 ? "Medium" : "Low";
  return {score, reasons, actions, opportunity, type, priority};
}

function getMessage(c){
  const a = analyse(c);
  if(c.lead === "yes"){
    return `Hi ${c.name}, hope you're well! Just checking in as we haven't got your first session booked yet. I have a couple of options available this week — would you like me to send you the times?`;
  }
  if(Number(c.remaining) <= 1){
    return `Hi ${c.name}, hope you're doing well! You've got ${Number(c.remaining)} session${Number(c.remaining)===1?"":"s"} left on your package, so I wanted to get ahead and make sure we have your next block of sessions planned. Shall I send you a few options?`;
  }
  if(Number(c.days) >= 14){
    return `Hi ${c.name}, hope you're well! I noticed it's been ${c.days} days since we trained, so I wanted to check in. Let's get your next session booked and keep your momentum going. What does your week look like?`;
  }
  if(Number(c.sessions) < Number(c.frequency)){
    return `Hi ${c.name}, hope you're well! I noticed we've been a little below your usual training frequency recently. I'd love to get you back into a consistent rhythm. What days work best for you this week?`;
  }
  return `Hi ${c.name}, hope you're well! Just checking in to get your next session booked. What does your week look like?`;
}

function render(){
  renderStats();
  renderPriorities();
  renderClients();
}

function renderStats(){
  const analysed = clients.map(c=>({c,a:analyse(c)}));
  const atRisk = analysed.filter(x=>x.a.score>=35).length;
  const followups = analysed.filter(x=>x.a.type==="follow-up" || Number(x.c.followUp)<=2).length;
  const revenue = analysed.filter(x=>x.a.score>=20).reduce((s,x)=>s+x.a.opportunity,0);
  $("#stats").innerHTML = `
    <div class="stat"><div class="stat-label">Clients</div><div class="stat-value">${clients.length}</div><div class="stat-sub">in your book</div></div>
    <div class="stat"><div class="stat-label">At risk</div><div class="stat-value">${atRisk}</div><div class="stat-sub">need attention</div></div>
    <div class="stat"><div class="stat-label">Follow-ups</div><div class="stat-value">${followups}</div><div class="stat-sub">due or soon</div></div>
    <div class="stat"><div class="stat-label">Revenue opportunity</div><div class="stat-value">${money(revenue)}</div><div class="stat-sub">estimated recoverable value</div></div>`;
}

function filteredAnalyses(){
  return clients.map(c=>({c,a:analyse(c)}))
    .filter(x => !searchTerm || `${x.c.name} ${x.c.phone}`.toLowerCase().includes(searchTerm))
    .filter(x => activeFilter==="all" || x.a.type===activeFilter)
    .sort((x,y)=>y.a.score-x.a.score);
}

function renderPriorities(){
  const list = filteredAnalyses();
  if(!list.length){ $("#priorityList").innerHTML=`<div class="empty">No clients match this view.</div>`; return; }
  $("#priorityList").innerHTML = list.map(({c,a})=>`
    <article class="priority-card">
      <div>
        <div class="person">
          <div class="avatar">${initials(c.name)}</div>
          <div>
            <h3>${escapeHtml(c.name)}</h3>
            <p>${escapeHtml(a.actions[0] || "Keep the relationship moving.")}</p>
          </div>
        </div>
        <div class="reasons">${a.reasons.slice(0,4).map(r=>`<span class="badge ${r[1]}">${escapeHtml(r[0])}</span>`).join("")}</div>
      </div>
      <div class="opportunity">
        <strong>${money(a.opportunity)}</strong><span>opportunity</span>
        <div class="action-row">
          <button class="small-btn dark" onclick="openDetail(${c.id})">View</button>
          <button class="small-btn" onclick="generateAndCopy(${c.id})">WhatsApp</button>
          <button class="small-btn" onclick="markDone(${c.id})">Done</button>
        </div>
      </div>
    </article>`).join("");
}

function renderClients(){
  const list = clients.filter(c=>!searchTerm || `${c.name} ${c.phone}`.toLowerCase().includes(searchTerm));
  if(!list.length){$("#clientList").innerHTML=`<div class="empty">No clients found.</div>`;return;}
  $("#clientList").innerHTML = list.sort((a,b)=>a.name.localeCompare(b.name)).map(c=>{
    const a=analyse(c);
    return `<div class="client-row">
      <div class="person">
        <div class="avatar">${initials(c.name)}</div>
        <div>
          <h3>${escapeHtml(c.name)}</h3>
          <p>${escapeHtml(c.phone||"No phone added")} · ${money(c.value)} package</p>
          <div class="client-meta"><span class="badge ${a.priority==="High"?"danger":a.priority==="Medium"?"warn":"ok"}">${a.priority} priority</span><span class="badge">${c.remaining} sessions left</span></div>
        </div>
      </div>
      <div class="client-actions">
        <button class="small-btn" onclick="openDetail(${c.id})">Details</button>
        <button class="small-btn" onclick="generateAndCopy(${c.id})">Message</button>
        <button class="small-btn" onclick="deleteClient(${c.id})">Delete</button>
      </div>
    </div>`;
  }).join("");
}

window.openDetail = function(id){
  const c=clients.find(x=>x.id===id); if(!c)return;
  const a=analyse(c), msg=getMessage(c);
  const d=$("#detailDialog");
  d.innerHTML=`<div class="detail-body">
    <div class="detail-top">
      <div><div class="section-kicker">CLIENT</div><h2>${escapeHtml(c.name)}</h2><p>${escapeHtml(c.phone||"No phone added")}</p></div>
      <button class="icon-btn" onclick="detailDialog.close()">×</button>
    </div>
    <div class="reasons">${a.reasons.map(r=>`<span class="badge ${r[1]}">${escapeHtml(r[0])}</span>`).join("")}</div>
    <div class="detail-grid">
      <div class="detail-stat"><span>Opportunity</span><strong>${money(a.opportunity)}</strong></div>
      <div class="detail-stat"><span>Frequency</span><strong>${c.sessions}/${c.frequency}</strong></div>
      <div class="detail-stat"><span>Sessions left</span><strong>${c.remaining}</strong></div>
      <div class="detail-stat"><span>Last session</span><strong>${c.days}d ago</strong></div>
      <div class="detail-stat"><span>Priority</span><strong>${a.priority}</strong></div>
      <div class="detail-stat"><span>Lead</span><strong>${c.lead==="yes"?"Yes":"No"}</strong></div>
    </div>
    <h3>Recommended action</h3>
    <p>${escapeHtml(a.actions[0]||"Keep the relationship moving.")}</p>
    <h3>Ready-to-send WhatsApp</h3>
    <div class="message-box" id="msg-${id}">${escapeHtml(msg)}</div>
    <div class="dialog-actions">
      <button class="btn btn-ghost" onclick="copyMessage(${id})">Copy message</button>
      <button class="btn btn-primary" onclick="openWhatsApp(${id})">Open WhatsApp</button>
      <button class="btn btn-ghost" onclick="markDone(${id});detailDialog.close()">Mark done</button>
    </div>
    <p style="color:#777;font-size:12px;margin-top:18px">${escapeHtml(c.notes||"No notes.")}</p>
  </div>`;
  d.showModal();
};

window.copyMessage = async function(id){
  try { await navigator.clipboard.writeText(getMessage(clients.find(c=>c.id===id))); toast("Message copied"); }
  catch { toast("Copy not available — select the message manually."); }
};
window.generateAndCopy = async function(id){
  await copyMessage(id);
};
window.openWhatsApp = function(id){
  const c=clients.find(x=>x.id===id); if(!c)return;
  const msg=encodeURIComponent(getMessage(c));
  if(c.phone){
    const phone=c.phone.replace(/[^\d]/g,"");
    window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");
  } else {
    navigator.clipboard?.writeText(getMessage(c));
    toast("No phone saved — message copied instead.");
  }
};
window.markDone = function(id){
  const c=clients.find(x=>x.id===id); if(!c)return;
  c.followUp=7; c.lastContact=0; save(); render(); toast(`${c.name}: follow-up marked done`);
};
window.deleteClient = function(id){
  const c=clients.find(x=>x.id===id); if(!c)return;
  if(confirm(`Delete ${c.name}?`)){clients=clients.filter(x=>x.id!==id);save();render();toast("Client deleted");}
};

function toast(text){
  const el=$("#toast");el.textContent=text;el.classList.add("show");
  clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.remove("show"),2200);
}

$("#filterSelect").addEventListener("change",e=>{activeFilter=e.target.value;renderPriorities()});
$("#searchInput").addEventListener("input",e=>{searchTerm=e.target.value.trim().toLowerCase();render()});
$("#addClientBtn").addEventListener("click",()=>$("#clientDialog").showModal());

$("#clientForm").addEventListener("submit",e=>{
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  const c={
    id:Date.now(), name:f.get("name").trim(), phone:f.get("phone").trim(),
    value:Number(f.get("value"))||0, frequency:Number(f.get("frequency"))||1,
    sessions:0, days:Number(f.get("days"))||0, remaining:Number(f.get("remaining"))||0,
    lead:f.get("lead"), followUp:Number(f.get("followUp"))||0, lastContact:0,
    notes:f.get("notes").trim()
  };
  clients.push(c);save();render();e.currentTarget.reset();$("#clientDialog").close();toast(`${c.name} added`);
});

$("#exportBtn").addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify(clients,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=url;a.download="pt-revenue-radar-backup.json";a.click();URL.revokeObjectURL(url);toast("Backup exported");
});
$("#importInput").addEventListener("change",async e=>{
  const file=e.target.files[0]; if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    if(!Array.isArray(data))throw new Error();
    clients=data;save();render();toast("Backup imported");
  }catch{toast("That backup file is not valid.");}
  e.target.value="";
});

if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
render();
