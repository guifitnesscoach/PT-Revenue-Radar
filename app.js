const seed = [
  {id:1,name:"Sarah",phone:"",value:180,frequency:3,sessions:1,days:17,remaining:2,lead:"no"},
  {id:2,name:"John",phone:"",value:300,frequency:4,sessions:3,days:6,remaining:1,lead:"no"},
  {id:3,name:"Emma",phone:"",value:240,frequency:3,sessions:1,days:11,remaining:4,lead:"no"},
  {id:4,name:"Mike",phone:"",value:150,frequency:2,sessions:0,days:30,remaining:0,lead:"yes"}
];
let clients = JSON.parse(localStorage.getItem("ptrr_clients") || "null") || seed;

const money = n => "£" + Math.round(n).toLocaleString("en-GB");
function risk(c){
  if(c.lead==="yes") return {type:"lead", label:"Lead follow-up", reason:"Lead needs a follow-up", amount:c.value};
  if(c.remaining<=1 && c.remaining>=0) return {type:"renewal",label:"Renewal opportunity",reason:`${c.remaining} session${c.remaining===1?"":"s"} remaining`,amount:c.value};
  if(c.days>=14 || (c.frequency>0 && c.sessions/c.frequency<0.5)) return {type:"risk",label:"Client at risk",reason:`${c.days} days since last session`,amount:c.value};
  if(c.frequency>0 && c.sessions/c.frequency<0.75) return {type:"risk",label:"Frequency dropped",reason:`${c.sessions}/${c.frequency} sessions this month`,amount:c.value*.5};
  return null;
}
function render(){
  const rs=clients.map(c=>({c,r:risk(c)})).filter(x=>x.r);
  const opportunity=rs.reduce((s,x)=>s+x.r.amount,0);
  document.getElementById("stats").innerHTML=[
    ["Clients",clients.length],
    ["At risk",rs.filter(x=>x.r.type==="risk").length],
    ["Follow-ups",rs.length],
    ["Revenue opportunity",money(opportunity)]
  ].map(x=>`<div class="stat"><div class="label">${x[0]}</div><div class="num">${x[1]}</div></div>`).join("");
  document.getElementById("opportunity").textContent=money(opportunity);
  document.getElementById("breakdown").innerHTML=`At risk: ${money(rs.filter(x=>x.r.type==="risk").reduce((s,x)=>s+x.r.amount,0))}<br>Renewals: ${money(rs.filter(x=>x.r.type==="renewal").reduce((s,x)=>s+x.r.amount,0))}<br>Leads: ${rs.filter(x=>x.r.type==="lead").length}`;
  renderActions(); renderClients();
}
function renderActions(){
  const f=document.getElementById("filter").value;
  const q=document.getElementById("search").value.toLowerCase();
  const data=clients.map(c=>({c,r:risk(c)})).filter(x=>x.r && (f==="all"||x.r.type===f) && x.c.name.toLowerCase().includes(q));
  document.getElementById("actions").innerHTML=data.length?data.map(x=>`
    <div class="action">
      <span class="badge"></span><div class="action-main"><strong>${x.c.name} — ${x.r.label}</strong><span>${x.r.reason} · ${money(x.r.amount)} potential</span></div>
      <button onclick="message('${x.c.name.replace(/'/g,"\\'")}')">Generate message</button>
    </div>`).join(""):`<p>No actions match this filter.</p>`;
}
function renderClients(){
  const q=document.getElementById("search").value.toLowerCase();
  const rows=clients.filter(c=>c.name.toLowerCase().includes(q));
  document.getElementById("clients").innerHTML=rows.map(c=>{
    const r=risk(c);
    const status=r ? `<span class="pill ${r.type==="risk"?"danger":r.type==="renewal"?"warning":""}">${r.label}</span>`:`<span class="pill good">Healthy</span>`;
    return `<div class="client-row"><div><strong>${c.name}</strong><div class="muted">${c.phone||"No phone added"}</div></div><div>${money(c.value)}<div class="muted">monthly</div></div><div>${c.sessions}/${c.frequency}<div class="muted">sessions</div></div><div>${c.days} days<div class="muted">since session</div></div><div>${status}</div></div>`;
  }).join("");
}
function message(name){
  const text=`Hey ${name}, hope you're well! Just checking in as I noticed we haven't trained together recently. Would you like me to get you booked in for a session this week?`;
  alert("AI message draft:\\n\\n"+text+"\\n\\n(MVP placeholder — WhatsApp integration comes next.)");
}
document.getElementById("filter").onchange=renderActions;
document.getElementById("search").oninput=()=>{renderActions();renderClients()};
document.getElementById("addClientBtn").onclick=()=>document.getElementById("clientDialog").showModal();
document.getElementById("cancelBtn").onclick=()=>document.getElementById("clientDialog").close();
document.getElementById("clientForm").onsubmit=e=>{
  e.preventDefault(); const f=new FormData(e.target);
  clients.push({id:Date.now(),name:f.get("name"),phone:f.get("phone"),value:+f.get("value"),frequency:+f.get("frequency"),sessions:+f.get("sessions"),days:+f.get("days"),remaining:+f.get("remaining"),lead:f.get("lead")});
  localStorage.setItem("ptrr_clients",JSON.stringify(clients)); e.target.reset(); document.getElementById("clientDialog").close(); render();
};
render();
