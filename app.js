
import { firebaseConfig } from "./firebase-config.js?v=hotfix2";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc,
  onSnapshot, query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const CREATOR_PIN = "0000";
const appEl = document.getElementById("app");

let firebaseApp, auth, db, uid;
let route = "home";
let groups = [];
let currentGroupId = localStorage.getItem("nn_current_group") || "";
let nickname = localStorage.getItem("nn_nickname") || "";
let isCreator = localStorage.getItem("nn_creator") === "yes";
let unsubscribeMessages = null;
let unsubscribeGroups = null;
let liveMessages = [];

start();

async function start(){
  try{
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) await reg.unregister();
    }
    firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);

    onAuthStateChanged(auth, user => {
      if(user){
        uid = user.uid;
        listenGroups();
        render();
      }
    });

    await signInAnonymously(auth);
  }catch(err){
    showFatal("Startup error", err.message);
  }
}

function listenGroups(){
  if(unsubscribeGroups) unsubscribeGroups();
  unsubscribeGroups = onSnapshot(
    query(collection(db, "groups"), orderBy("updatedAt", "desc"), limit(50)),
    snap => {
      groups = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      render();
    },
    err => showFatal("Groups permission error", err.message)
  );
}

function render(){
  if(!uid) return loading("Connecting…");
  if(route === "creatorLogin") return renderCreatorLogin();
  if(route === "creator") return renderCreator();
  if(route === "chat") return renderChat();
  if(route === "invite") return renderInvite();
  if(route === "apply") return renderApply();
  if(route === "admin") return renderAdmin();
  return renderHome();
}

function renderHome(){
  if(unsubscribeMessages){ unsubscribeMessages(); unsubscribeMessages = null; }
  const groupList = groups.map(g => `
    <button class="item js-open-group" data-id="${esc(g.id)}">
      <div class="avatar">${initials(g.name)}</div>
      <div class="item-main">
        <div class="item-title">${esc(g.name)}</div>
        <div class="item-sub">${esc(g.description || "No-number group chat")}</div>
      </div>
      ${badge(g.status || "active")}
    </button>
  `).join("") || `<div class="card"><h2>No groups yet</h2><p class="small">Open Creator Admin and create your first group.</p></div>`;

  appEl.innerHTML = `
    ${bar("NoNumber Chat", "Live Firebase chat · no phone numbers")}
    <main class="screen">
      <section class="hero">
        <div class="kicker">Live pilot hotfix</div>
        <h1>Scan. Nickname. Chat.</h1>
        <p>A real-time group chat tool where people join by QR code without sharing phone numbers.</p>
        <div class="statusline">Signed in anonymously · buttons hotfixed</div>
      </section>
      <section class="list">${groupList}</section>
      <section class="card">
        <div class="grid">
          <button class="btn primary js-route" data-route="creatorLogin">Creator Admin</button>
          <button class="btn ghost js-route" data-route="apply">Good Cause Apply</button>
          <button class="btn soft js-route" data-route="admin">Group Admin</button>
          <button class="btn ghost js-nickname">Set nickname</button>
        </div>
      </section>
    </main>
  `;
}

function renderCreatorLogin(){
  appEl.innerHTML = `
    ${bar("Creator Admin", "Master control", "home")}
    <main class="screen">
      <section class="card">
        <h2>Creator sign in</h2>
        <p class="small">Demo PIN: <strong>0000</strong>.</p>
        <label>PIN</label>
        <input id="pin" type="password" inputmode="numeric" autocomplete="off" />
        <button class="btn primary full js-creator-open" style="margin-top:12px">Open Creator Admin</button>
      </section>
    </main>
  `;
}

function renderCreator(){
  if(!isCreator) {
    route = "creatorLogin";
    return renderCreatorLogin();
  }

  const groupCards = groups.map(g => `
    <div class="card">
      <div class="row space">
        <div>
          <h3>${esc(g.name)}</h3>
          <p class="small">${esc(g.description || "")}</p>
        </div>
        ${badge(g.status || "active")}
      </div>
      <div class="row wrap">
        <button class="btn ghost js-open-group" data-id="${esc(g.id)}">Open</button>
        <button class="btn warn js-toggle-freeze" data-id="${esc(g.id)}">${g.status === "frozen" ? "Unfreeze" : "Freeze"}</button>
        <button class="btn ghost js-show-invite" data-id="${esc(g.id)}">QR</button>
      </div>
    </div>
  `).join("") || `<div class="card small">No groups yet. Create one now.</div>`;

  appEl.innerHTML = `
    ${bar("Creator Dashboard", "Create groups · freeze · invite", "home")}
    <main class="screen">
      <section class="card">
        <div class="grid">
          <button class="btn primary js-create-group">Create group</button>
          <button class="btn ghost js-creator-logout">Log out</button>
        </div>
      </section>
      <h2>Groups</h2>
      ${groupCards}
    </main>
  `;
}

function renderChat(){
  const group = groups.find(g => g.id === currentGroupId);
  if(!group){
    route = "home";
    return renderHome();
  }

  if(unsubscribeMessages) unsubscribeMessages();
  unsubscribeMessages = onSnapshot(
    query(collection(db, "groups", currentGroupId, "messages"), orderBy("createdAt", "asc"), limit(150)),
    snap => {
      liveMessages = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      paintChat(group);
    },
    err => showFatal("Messages permission error", err.message)
  );
  paintChat(group);
}

function paintChat(group){
  const msgs = liveMessages.map(m => msgHtml(m)).join("") || `<div class="card small">No messages yet.</div>`;
  appEl.innerHTML = `
    ${bar(group.name, `${group.status === "frozen" ? "Frozen" : "Live chat"}`, "home", `<button class="iconBtn js-invite-current">▦</button>`)}
    <main class="chat">
      <div class="chat-note">No phone numbers · keep it light · stay in the group</div>
      ${group.status === "frozen" ? `<div class="notice danger" style="margin:10px">This group is frozen. Messages are paused.</div>` : ""}
      <section class="messages" id="messages">${msgs}</section>
      <form class="composer js-send-form">
        <button class="shout js-shout" type="button">👋</button>
        <textarea id="message" maxlength="500" placeholder="Message" ${group.status === "frozen" ? "disabled" : ""}></textarea>
        <button class="round" ${group.status === "frozen" ? "disabled" : ""}>➤</button>
      </form>
    </main>
  `;
  setTimeout(() => {
    const box = document.getElementById("messages");
    if(box) box.scrollTop = box.scrollHeight;
  }, 50);
}

function renderInvite(){
  const group = groups.find(g => g.id === currentGroupId);
  if(!group){ route = "home"; return renderHome(); }
  const link = makeJoinLink(group);
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=470x470&margin=12&data=${encodeURIComponent(link)}`;
  appEl.innerHTML = `
    ${bar("Member QR Invite", group.name, "creator")}
    <main class="screen">
      <section class="card">
        <div class="kicker">Scan to join</div>
        <h2>${esc(group.name)}</h2>
        <p class="small">Members scan this, choose a nickname and join. No phone number.</p>
        <div class="qrbox"><img src="${qr}" alt="QR invite"></div>
        <div class="linkbox" id="inviteLink">${esc(link)}</div>
        <div class="grid" style="margin-top:10px">
          <button class="btn primary js-copy-invite">Copy link</button>
          <button class="btn ghost js-route" data-route="creator">Back</button>
        </div>
      </section>
    </main>
  `;
}

function renderApply(){
  appEl.innerHTML = `
    ${bar("Good Cause Access", "Apply to run a group", "home")}
    <main class="screen">
      <section class="card">
        <h2>Good-cause form</h2>
        <p class="small">This is the placeholder form for the live pilot. We’ll wire approval properly after the chat test.</p>
        <label>Your name</label><input>
        <label>Group / organisation</label><input>
        <label>What do you do?</label><textarea></textarea>
        <button class="btn primary full js-toast" data-toast="Application form opens. Approval wiring is next stage.">Submit application</button>
      </section>
    </main>
  `;
}

function renderAdmin(){
  appEl.innerHTML = `
    ${bar("Group Admin", "Approved admins later", "home")}
    <main class="screen">
      <section class="card">
        <h2>Group Admin</h2>
        <p class="small">For this hotfix, use Creator Admin to create the first live group. Admin approval wiring comes after we prove the chat works.</p>
        <button class="btn primary full js-route" data-route="home">Back home</button>
      </section>
    </main>
  `;
}

document.addEventListener("click", async (e) => {
  const routeBtn = e.target.closest(".js-route");
  if(routeBtn){
    route = routeBtn.dataset.route;
    render();
    return;
  }

  if(e.target.closest(".back")){
    route = e.target.closest(".back").dataset.route || "home";
    render();
    return;
  }

  if(e.target.closest(".js-nickname")){
    askNickname();
    return;
  }

  if(e.target.closest(".js-creator-open")){
    const pin = document.getElementById("pin")?.value.trim();
    if(pin !== CREATOR_PIN) return toast("Wrong PIN.");
    isCreator = true;
    localStorage.setItem("nn_creator", "yes");
    route = "creator";
    render();
    return;
  }

  if(e.target.closest(".js-creator-logout")){
    isCreator = false;
    localStorage.removeItem("nn_creator");
    route = "home";
    render();
    return;
  }

  if(e.target.closest(".js-create-group")){
    createGroupModal();
    return;
  }

  const openGroup = e.target.closest(".js-open-group");
  if(openGroup){
    currentGroupId = openGroup.dataset.id;
    localStorage.setItem("nn_current_group", currentGroupId);
    if(!nickname) return askNickname(() => { route = "chat"; render(); });
    route = "chat";
    render();
    return;
  }

  const freeze = e.target.closest(".js-toggle-freeze");
  if(freeze){
    await toggleFreeze(freeze.dataset.id);
    return;
  }

  const showInvite = e.target.closest(".js-show-invite");
  if(showInvite){
    currentGroupId = showInvite.dataset.id;
    localStorage.setItem("nn_current_group", currentGroupId);
    route = "invite";
    render();
    return;
  }

  if(e.target.closest(".js-invite-current")){
    route = "invite";
    render();
    return;
  }

  if(e.target.closest(".js-copy-invite")){
    const text = document.getElementById("inviteLink")?.textContent || "";
    await navigator.clipboard.writeText(text).catch(()=>{});
    toast("Invite copied.");
    return;
  }

  if(e.target.closest(".js-shout")){
    await sendMessage("Anyone about for a bit of general chat?", "shout");
    return;
  }

  const toastBtn = e.target.closest(".js-toast");
  if(toastBtn) toast(toastBtn.dataset.toast || "Done.");
});

document.addEventListener("submit", async (e) => {
  if(e.target.closest(".js-send-form")){
    e.preventDefault();
    const input = document.getElementById("message");
    const text = input?.value.trim();
    if(text) await sendMessage(text, "message");
    if(input) input.value = "";
  }
});

async function sendMessage(text, type){
  if(!nickname) return askNickname(() => sendMessage(text, type));
  if(hasPhone(text)) return toast("Phone numbers are blocked.");
  const group = groups.find(g => g.id === currentGroupId);
  if(!group) return toast("Open a group first.");
  if(group.status === "frozen") return toast("Group is frozen.");
  await addDoc(collection(db, "groups", currentGroupId, "messages"), {
    uid,
    nickname,
    type,
    text,
    createdAt: serverTimestamp()
  });
  await updateDoc(doc(db, "groups", currentGroupId), {
    lastMessage: text.slice(0,80),
    updatedAt: serverTimestamp()
  });
}

function createGroupModal(){
  showModal(`
    <h2>Create group</h2>
    <label>Group name</label>
    <input id="gName" placeholder="Example: Test Chat">
    <label>Description</label>
    <textarea id="gDesc" placeholder="First live test group"></textarea>
    <button class="btn primary full js-save-group" style="margin-top:12px">Create group</button>
    <button class="btn ghost full js-close-modal" style="margin-top:8px">Cancel</button>
  `);
  document.querySelector(".js-close-modal").onclick = closeModal;
  document.querySelector(".js-save-group").onclick = saveGroup;
}

async function saveGroup(){
  const name = document.getElementById("gName")?.value.trim();
  const description = document.getElementById("gDesc")?.value.trim();
  if(!name) return toast("Add a group name.");
  const ref = await addDoc(collection(db, "groups"), {
    name,
    description,
    status: "active",
    inviteCode: makeCode(),
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: "Group created"
  });
  await addDoc(collection(db, "groups", ref.id, "messages"), {
    uid: "system",
    nickname: "Admin",
    type: "system",
    text: "Group created. Members join by QR using a nickname only.",
    createdAt: serverTimestamp()
  });
  closeModal();
  currentGroupId = ref.id;
  localStorage.setItem("nn_current_group", currentGroupId);
  route = "chat";
  render();
}

async function toggleFreeze(groupId){
  const group = groups.find(g => g.id === groupId);
  if(!group) return;
  await updateDoc(doc(db, "groups", groupId), {
    status: group.status === "frozen" ? "active" : "frozen",
    updatedAt: serverTimestamp()
  });
  toast(group.status === "frozen" ? "Unfrozen." : "Frozen.");
}

function askNickname(done){
  showModal(`
    <h2>Choose a nickname</h2>
    <p class="small">No phone number needed.</p>
    <label>First name or nickname</label>
    <input id="nick" maxlength="32" placeholder="Example: Craig" value="${esc(nickname)}">
    <button class="btn primary full js-save-nick" style="margin-top:12px">Save</button>
  `);
  document.querySelector(".js-save-nick").onclick = () => {
    const n = document.getElementById("nick")?.value.trim();
    if(!n) return toast("Add a nickname.");
    if(hasPhone(n)) return toast("Use a nickname, not a number.");
    nickname = n;
    localStorage.setItem("nn_nickname", nickname);
    closeModal();
    toast("Nickname saved.");
    if(done) done();
  };
}

function msgHtml(m){
  const mine = m.uid === uid;
  return `
    <article class="msg ${mine ? "mine" : ""} ${m.type === "system" ? "system" : ""} ${m.type === "shout" ? "shout" : ""}">
      <div class="bubble">
        ${m.type !== "system" ? `<div class="msg-name">${m.type === "shout" ? "👋 " : ""}${esc(m.nickname || "Someone")}</div>` : ""}
        <div class="msg-text">${esc(m.text || "")}</div>
        <div class="msg-time">${time(m.createdAt)} ${mine ? "✓" : ""}</div>
      </div>
    </article>
  `;
}

function bar(title, sub="", backRoute="", actions=""){
  return `
    <header class="appbar">
      ${backRoute ? `<button class="back" data-route="${backRoute}">‹</button>` : ""}
      <div class="avatar">${initials(title)}</div>
      <div class="title-wrap"><div class="title">${esc(title)}</div><div class="sub">${esc(sub)}</div></div>
      ${actions}
    </header>
  `;
}

function badge(status){
  const cls = status === "active" ? "ok" : status === "frozen" ? "stop" : "warn";
  return `<span class="badge ${cls}">${esc(status || "active")}</span>`;
}

function loading(text){ appEl.innerHTML = `<div class="loading"><div class="logo">NN</div><p>${esc(text)}</p></div>`; }
function showFatal(title, msg){ appEl.innerHTML = `${bar(title, "Error")}<main class="screen"><div class="notice danger">${esc(msg)}</div></main>`; }
function showModal(html){ const m=document.createElement("div"); m.className="modal-backdrop"; m.id="modal"; m.innerHTML=`<div class="modal">${html}</div>`; document.body.appendChild(m); }
function closeModal(){ document.getElementById("modal")?.remove(); }
function toast(text){ document.getElementById("toast")?.remove(); const t=document.createElement("div"); t.id="toast"; t.className="toast"; t.textContent=text; document.body.appendChild(t); setTimeout(()=>t.remove(),2300); }
function makeJoinLink(g){ const url=new URL(location.href); url.search=""; url.searchParams.set("join", g.id); url.searchParams.set("code", g.inviteCode || ""); return url.toString(); }
function makeCode(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }
function time(ts){ try { return ts?.toDate ? ts.toDate().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : ""; } catch { return ""; } }
function initials(name=""){ return (String(name).trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("") || "?").toUpperCase(); }
function esc(str=""){ return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function hasPhone(text){ return /(?:\+?\d[\s().-]*){9,}/.test(String(text)); }
