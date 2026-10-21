const seed = [
  {id:1,name:"Sarah",phone:"",value:180,frequency:3,sessions:1,days:17,remaining:2,lead:"no"},
  {id:2,name:"John",phone:"",value:300,frequency:4,sessions:3,days:6,remaining:1,lead:"no"},
  {id:3,name:"Emma",phone:"",value:240,frequency:3,sessions:1,days:11,remaining:4,lead:"no"},
  {id:4,name:"Mike",phone:"",value:150,frequency:2,sessions:0,days:30,remaining:0,lead:"yes"}
];

let clients = JSON.parse(localStorage.getItem("ptrr_clients") || "null") || seed;
let completed = JSON.parse(localStorage.getItem("ptrr_completed") || "[]");

const money = n => "£" + Math.round(n).toLocaleString("en-GB");

function analyse(c){
  if(c.lead==="yes"){
    return {type:"lead",label:"Lead follow-up",reason:"New lead needs a response",recommendation:"Contact the lead today",amount:c.value,score:100};
  }
  if(c.remaining<=1){
    return {type:"renewal",label:"Renewal opportunity",reason:`${c.remaining} session${c.remaining===1?"":"s"} remaining`,recommendation:"Ask about the next package",amount:c.value,score:95};
  }
  const ratio = c.frequency>0 ? c.sessions/c.frequency : 1;
  if(c.days>=14){
    return {type:"risk",label:"Client at risk",reason:`${c.days} days since last session`,recommendation:"Re-engage this client",amount:c.value,score:92};
  }
  if(ratio<0.5){
    return {type:"risk",label:"Frequency dropped",reason:`${c.sessions}/${c.frequency} sessions this month`,recommendation:"Book the next session",amount:c.value,score:88};
  }
  if(ratio<0.75){
    return {type:"risk",label:"Frequency slipping",reason:`${c.sessions}/${c.frequency} sessions this month`,recommendation:"Get another session booked",amount:Math.round(c.value*.5),score:72};
  }
  return null;
}

function actionItems(){
  return clients.map(c=>({c,r:analyse(c)}))
    .filter(x=>x.r && !completed.includes(x.c.id))
    .sort((a,b)=>b.r.score-a.r.score || b.r.amount-a.r.amount);
}

function save(){
  localStorage.setItem("ptrr_clients",JSON.stringify(clients));
  localStorage.setItem("ptrr_completed",JSON.stringify(completed));
}

function render(){
  const all = clients.map(c=>({c,r:analyse(c)})).filter(x=>x.r);
  const items = actionItems();
  const opportunity = all.reduce((sum,x)=>sum+x.r.amount,0);
  const atRisk = all.filter(x=>x.r.type==="risk");
  const renewals = all.filter(x=>x.r.type==="renewal");
  const leads = all.filter(x=>x.r.type==="lead");

  document.getElementById("stats").innerHTML = [
    ["Clients",clients.length],
    ["At risk",atRisk.length],
    ["Today's actions",items.length],
    ["Revenue opportunity",money(opportunity)]
  ].map(x=>`<div class="stat"><div class="label">${x[0]}</div><div class="num">${x[1]}</div></div>`).join("");

  document.getElementById("heroAlert").innerHTML = `
    <div><div class="hero-title">${items.length ? `You have ${items.length} action${items.length===1?"":"s"} to take today.` : "Your radar is clear."}</div>
    <div class="hero-sub">${items.length ? "Start with the highest-value action below." : "No outstanding priority actions right now."}</div></div>
    <div class="hero-money">${money(opportunity)} <small>opportunity</small></div>`;

  document.getElementById("opportunity").textContent = money(opportunity);
  document.getElementById("breakdown").innerHTML =
    `At risk: <b>${money(atRisk.reduce((s,x)=>s+x.r.amount,0))}</b><br>`+
    `Renewals: <b>${money(renewals.reduce((s,x)=>s+x.r.amount,0))}</b><br>`+
    `Leads: <b>${money(leads.reduce((s,x)=>s+x.r.amount,0))}</b>`;

  renderActions();
  renderClients();
}

function renderActions(){
  const f=document.getElementById("filter").value;
  const q=document.getElementById("search").value.toLowerCase();
  const data=actionItems().filter(x=>(f==="all"||x.r.type===f)&&x.c.name.toLowerCase().includes(q));

  document.getElementById("actions").innerHTML = data.length ? data.map((x,i)=>`
    <div class="action">
      <div class="priority">${i+1}</div>
      <div class="action-main">
        <strong>${escapeHtml(x.c.name)} — ${x.r.label}</strong>
        <span class="reason">${x.r.reason} · <b>${money(x.r.amount)}</b> potential</span>
        <span class="recommendation">→ ${x.r.recommendation}</span>
        <div class="action-buttons">
          <button class="main-action" onclick="message(${x.c.id})">Generate WhatsApp</button>
          <button onclick="completeAction(${x.c.id})">Mark done</button>
        </div>
      </div>
      <div class="action-value"><strong>${money(x.r.amount)}</strong><span>potential</span></div>
    </div>`).join("") : `<p style="padding:10px 0 18px">No outstanding actions match this filter.</p>`;
}

function renderClients(){
  const q=document.getElementById("search").value.toLowerCase();
  const rows=clients.filter(c=>c.name.toLowerCase().includes(q));
  document.getElementById("clients").innerHTML=rows.map(c=>{
    const r=analyse(c);
    const status=r
      ? `<span class="pill ${r.type==="risk"?"danger":r.type==="renewal"?"warning":"lead-pill"}">${r.label}</span>`
      : `<span class="pill good">Healthy</span>`;
    return `<div class="client-row">
      <div><strong>${escapeHtml(c.name)}</strong><div class="muted">${escapeHtml(c.phone||"No phone added")}</div></div>
      <div>${money(c.value)}<div class="muted">monthly</div></div>
      <div>${c.sessions}/${c.frequency}<div class="muted">sessions</div></div>
      <div>${c.days} days<div class="muted">since session</div></div>
      <div>${status}</div>
      <div class="client-actions">${r && !completed.includes(c.id) ? `<button class="small-btn" onclick="message(${c.id})">Message</button>` : ""}</div>
    </div>`;
  }).join("");
}

function message(id){
  const c=clients.find(x=>x.id===id); if(!c) return;
  const r=analyse(c);
  let text;
  if(c.lead==="yes"){
    text=`Hey ${c.name}, hope you're well! Just following up to see if you'd still like to book a PT session. I have a few options available this week — would you like me to send you some times?`;
  } else if(r && r.type==="renewal"){
    text=`Hey ${c.name}, hope you're well! I noticed you're coming towards the end of your current package. Shall we get your next sessions booked in so you can keep your training consistent?`;
  } else {
    text=`Hey ${c.name}, hope you're well! I noticed we haven't trained recently and I wanted to check in. Shall we get your next session booked in this week?`;
  }
  showMessageModal(c.name,text);
}

function showMessageModal(name,text){
  const existing=document.getElementById("messageDialog");
  if(existing) existing.remove();
  const d=document.createElement("dialog");
  d.id="messageDialog";
  d.innerHTML=`<form method="dialog"><h2>WhatsApp draft for ${escapeHtml(name)}</h2><p class="form-help">V2 creates the draft. Real WhatsApp sending will be added later.</p><textarea id="messageText" style="width:100%;min-height:150px;padding:12px;border:1px solid #d7dae0;border-radius:9px;font:inherit">${escapeHtml(text)}</textarea><div class="dialog-actions"><button type="button" onclick="copyMessage()">Copy message</button><button class="primary dark">Close</button></div></form>`;
  document.body.appendChild(d); d.showModal();
}

function copyMessage(){
  const t=document.getElementById("messageText").value;
  navigator.clipboard?.writeText(t).then(()=>toast("Message copied")).catch(()=>toast("Select and copy the message"));
}

function completeAction(id){
  if(!completed.includes(id)) completed.push(id);
  save(); render(); toast("Action marked as done");
}

function toast(text){
  const el=document.getElementById("toast"); el.textContent=text; el.classList.add("show");
  clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.remove("show"),1800);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

document.getElementById("filter").onchange=renderActions;
document.getElementById("search").oninput=()=>{renderActions();renderClients()};
document.getElementById("addClientBtn").onclick=()=>document.getElementById("clientDialog").showModal();
document.getElementById("cancelBtn").onclick=()=>document.getElementById("clientDialog").close();

document.getElementById("clientForm").onsubmit=e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  clients.push({
    id:Date.now(),name:f.get("name"),phone:f.get("phone"),value:+f.get("value"),
    frequency:+f.get("frequency"),sessions:+f.get("sessions"),days:+f.get("days"),
    remaining:+f.get("remaining"),lead:f.get("lead")
  });
  save(); e.target.reset(); document.getElementById("clientDialog").close(); render(); toast("Client added");
};

render();
