
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, limit, serverTimestamp, Timestamp, where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const CREATOR_PIN = "0000"; // DEMO ONLY. Real creator control should be secured server-side.
const RULES = [
  "No phone numbers in the group.",
  "Use a first name or nickname only.",
  "Keep chat friendly, light and in the group.",
  "No politics, medical advice, criminal/legal matters, abuse, or pressure to private message.",
  "Admins can remove messages or members to keep the group safe and useful."
];

let appEl = document.getElementById("app");
let fbApp, auth, db, uid = null;
let state = {
  route: "home",
  creator: localStorage.getItem("nn_creator") === "yes",
  profile: JSON.parse(localStorage.getItem("nn_profile") || "{}"),
  currentGroupId: localStorage.getItem("nn_group") || "",
  joinInvite: readJoinInvite(),
  unsub: [],
  groups: [],
  messages: [],
  presence: [],
  typing: [],
  applications: [],
  admins: [],
  setupOk: false
};

boot();

function boot(){
  if(!firebaseConfig || String(firebaseConfig.apiKey || "").includes("PASTE_")){
    renderSetup();
    return;
  }
  try{
    fbApp = initializeApp(firebaseConfig);
    auth = getAuth(fbApp);
    db = getFirestore(fbApp);
    state.setupOk = true;
    renderLoading("Signing in without phone number…");
    onAuthStateChanged(auth, user => {
      if(user){
        uid = user.uid;
        listenHome();
        if(state.joinInvite) state.route = "join";
        render();
      }
    });
    signInAnonymously(auth).catch(err => {
      renderFatal("Firebase anonymous sign-in failed", err.message);
    });
  }catch(err){
    renderFatal("Firebase setup failed", err.message);
  }
}

function renderSetup(){
  appEl.innerHTML = `
    ${bar("NoNumber Setup", "Firebase config needed")}
    <main class="screen">
      <section class="hero">
        <div class="kicker">one-time setup</div>
        <h1>Almost ready for live chat.</h1>
        <p>This version is a real Firebase chat app. Paste your Firebase web config into <strong>firebase-config.js</strong>, enable Anonymous Auth and Firestore, then upload again.</p>
      </section>
      <section class="card">
        <h2>What to do</h2>
        <ol class="rule-list">
          <li>Create a Firebase project.</li>
          <li>Enable Authentication → Anonymous sign-in.</li>
          <li>Create a Firestore database.</li>
          <li>Paste your web app config into <strong>firebase-config.js</strong>.</li>
          <li>Publish the included <strong>firestore.rules</strong>.</li>
          <li>Upload the files to GitHub Pages.</li>
        </ol>
      </section>
      <section class="notice warn">This screen disappears once your Firebase config is pasted in.</section>
    </main>
  `;
}

function renderLoading(text){
  appEl.innerHTML = `<div class="loading"><div class="logo">NN</div><p>${esc(text)}</p></div>`;
}

function renderFatal(title, msg){
  appEl.innerHTML = `${bar(title,"Something needs fixing")}<main class="screen"><div class="notice danger">${esc(msg)}</div></main>`;
}

function readJoinInvite(){
  const p = new URLSearchParams(location.search);
  const g = p.get("join"), code = p.get("code");
  return g && code ? {groupId:g, code} : null;
}

function listenHome(){
  clearSubs();
  state.unsub.push(onSnapshot(query(collection(db,"groups"), orderBy("updatedAt","desc"), limit(50)), snap => {
    state.groups = snap.docs.map(d => ({id:d.id, ...d.data()}));
    if(!state.currentGroupId && state.groups[0]) state.currentGroupId = state.groups[0].id;
    if(["home","creator","admin"].includes(state.route)) render();
  }));
}

function clearSubs(){
  state.unsub.forEach(fn => { try{ fn(); }catch(e){} });
  state.unsub = [];
}

function listenChat(groupId){
  clearSubs();
  const msgQ = query(collection(db,"groups",groupId,"messages"), orderBy("createdAt","asc"), limit(150));
  state.unsub.push(onSnapshot(msgQ, snap => {
    state.messages = snap.docs.map(d => ({id:d.id, ...d.data()}));
    if(state.route === "chat") renderChat();
  }));
  state.unsub.push(onSnapshot(collection(db,"groups",groupId,"presence"), snap => {
    const cutoff = Date.now() - 1000*90;
    state.presence = snap.docs.map(d => ({id:d.id, ...d.data()})).filter(p => toMillis(p.activeAt) > cutoff);
    if(state.route === "chat") updateChatHeader();
  }));
  state.unsub.push(onSnapshot(collection(db,"groups",groupId,"typing"), snap => {
    const cutoff = Date.now() - 1000*6;
    state.typing = snap.docs.map(d => ({id:d.id, ...d.data()})).filter(t => t.uid !== uid && toMillis(t.updatedAt) > cutoff);
    if(state.route === "chat") updateTyping();
  }));
  heartbeat(groupId);
  setInterval(() => { if(state.route === "chat" && state.currentGroupId === groupId) heartbeat(groupId); }, 30000);
}

async function heartbeat(groupId){
  if(!uid) return;
  await setDoc(doc(db,"groups",groupId,"presence",uid), {
    uid, nickname: state.profile.nickname || "Someone", activeAt: serverTimestamp()
  }, {merge:true}).catch(()=>{});
}

function render(){
  if(!uid) return renderLoading("Connecting…");
  if(state.route === "join") return renderJoin();
  if(state.route === "chat") return renderChat();
  if(state.route === "invite") return renderInvite();
  if(state.route === "creator") return renderCreator();
  if(state.route === "admin") return renderAdmin();
  if(state.route === "apply") return renderApply();
  return renderHome();
}

function renderHome(){
  listenHome();
  const list = state.groups.map(g => `
    <button class="item" data-open-group="${g.id}">
      <div class="avatar">${initials(g.name)}</div>
      <div class="item-main">
        <div class="item-title">${esc(g.name)}</div>
        <div class="item-sub">${esc(g.description || "No-number group chat")} · ${esc(g.status || "active")}</div>
      </div>
      ${statusBadge(g.status || "active")}
    </button>
  `).join("") || `<div class="card"><h2>No groups yet</h2><p class="small">Open Creator Admin and create your first group.</p></div>`;
  appEl.innerHTML = `
    ${bar("NoNumber Chat","Live Firebase chat · no phone numbers")}
    <main class="screen">
      <section class="hero">
        <div class="kicker">live pilot</div>
        <h1>Scan. Nickname. Chat.</h1>
        <p>A real-time group chat tool where people join by QR code without sharing phone numbers.</p>
      </section>
      <section class="list">${list}</section>
      <section class="card">
        <div class="grid">
          <button class="btn primary" data-route="creator">Creator Admin</button>
          <button class="btn ghost" data-route="apply">Good Cause Apply</button>
          <button class="btn soft" data-route="admin">Group Admin</button>
          <button class="btn ghost" id="setNickBtn">Set nickname</button>
        </div>
      </section>
    </main>
  `;
  bind();
  qsa("[data-open-group]").forEach(b => b.onclick = () => openChat(b.dataset.openGroup));
  byId("setNickBtn").onclick = askNickname;
}

async function openChat(groupId){
  const groupSnap = await getDoc(doc(db,"groups",groupId));
  if(!groupSnap.exists()) return toast("Group not found.");
  const g = {id: groupSnap.id, ...groupSnap.data()};
  if(g.status === "frozen") return toast("This group is frozen by Creator Admin.");
  state.currentGroupId = groupId;
  localStorage.setItem("nn_group", groupId);
  if(!state.profile.nickname) return askNickname(() => openChat(groupId));
  await setDoc(doc(db,"groups",groupId,"members",uid), {
    uid, nickname: state.profile.nickname, joinedAt: serverTimestamp()
  }, {merge:true});
  state.route = "chat";
  listenChat(groupId);
  renderChat();
}

async function renderJoin(){
  const invite = state.joinInvite;
  const snap = await getDoc(doc(db,"groups",invite.groupId));
  if(!snap.exists()){
    appEl.innerHTML = `${bar("Invite not found","NoNumber Chat")}<main class="screen"><div class="notice danger">This group link does not exist.</div></main>`;
    return;
  }
  const group = {id:snap.id, ...snap.data()};
  const badCode = group.inviteCode !== invite.code;
  const frozen = group.status === "frozen";
  appEl.innerHTML = `
    ${bar(group.name,"Join by nickname only")}
    <main class="screen">
      <section class="hero">
        <div class="kicker">member invite</div>
        <h1>No number needed.</h1>
        <p>Choose a first name or nickname, accept the rules, and join the live chat.</p>
      </section>
      ${badCode ? `<div class="notice danger">This QR code has expired or been reset.</div>` : ""}
      ${frozen ? `<div class="notice danger">This group is currently frozen.</div>` : ""}
      <section class="card">
        <label for="nick">First name or nickname</label>
        <input id="nick" maxlength="32" placeholder="Example: Craig or Big John" value="${esc(state.profile.nickname || "")}">
        <div class="notice">
          <strong>Rules</strong>
          <ul class="rule-list">${RULES.map(r=>`<li>${esc(r)}</li>`).join("")}</ul>
        </div>
        <button class="btn primary full" id="joinBtn" ${badCode || frozen ? "disabled" : ""}>I agree and join</button>
      </section>
    </main>
  `;
  byId("joinBtn").onclick = async () => {
    const nick = val("nick");
    if(!nick) return toast("Add a nickname.");
    if(hasPhone(nick)) return toast("Use a nickname, not a number.");
    state.profile.nickname = nick;
    saveProfile();
    await setDoc(doc(db,"groups",group.id,"members",uid), {
      uid, nickname:nick, joinedAt:serverTimestamp()
    }, {merge:true});
    state.currentGroupId = group.id;
    localStorage.setItem("nn_group", group.id);
    history.replaceState(null,"",location.pathname);
    state.joinInvite = null;
    state.route = "chat";
    listenChat(group.id);
    renderChat();
  };
}

async function renderChat(){
  const groupId = state.currentGroupId;
  const snap = await getDoc(doc(db,"groups",groupId));
  if(!snap.exists()) return renderHome();
  const group = {id:snap.id, ...snap.data()};
  const people = state.presence.length || 1;
  appEl.innerHTML = `
    ${bar(group.name, `${people} people about · ${group.status === "frozen" ? "frozen" : "online now"}`, {back:"home", actions:`<button class="icon-btn" data-route="invite">▦</button>`})}
    <main class="chat">
      <div class="chat-note">No phone numbers · keep it light · stay in the group</div>
      ${group.status === "frozen" ? `<div class="notice danger" style="margin:10px">This group is frozen. Messages are paused.</div>` : ""}
      <section class="messages" id="messages">${state.messages.map(m => msgHtml(m)).join("")}</section>
      <div class="typing ${state.typing.length ? "" : "hidden"}" id="typing"><div class="dots"><span></span><span></span><span></span></div><span>Someone is typing…</span></div>
      <form class="composer" id="sendForm">
        <button class="shout" type="button" id="shoutBtn">👋</button>
        <textarea id="message" maxlength="500" placeholder="Message" ${group.status === "frozen" ? "disabled" : ""}></textarea>
        <button class="round" ${group.status === "frozen" ? "disabled" : ""}>➤</button>
      </form>
    </main>
  `;
  bind();
  byId("shoutBtn").onclick = () => sendMessage("Anyone about for a bit of general chat?", "shout");
  byId("sendForm").onsubmit = e => {
    e.preventDefault();
    const text = val("message");
    if(text) sendMessage(text, "message");
  };
  byId("message").oninput = async () => {
    await setDoc(doc(db,"groups",groupId,"typing",uid), {
      uid, nickname:state.profile.nickname || "Someone", updatedAt:serverTimestamp()
    }, {merge:true}).catch(()=>{});
  };
  setTimeout(()=>{ const box=byId("messages"); if(box) box.scrollTop=box.scrollHeight; },50);
}

function updateTyping(){
  const el = byId("typing");
  if(!el) return;
  el.classList.toggle("hidden", !state.typing.length);
}

function updateChatHeader(){
  const sub = document.querySelector(".sub");
  if(sub) sub.textContent = `${state.presence.length || 1} people about · online now`;
}

function msgHtml(m){
  const mine = m.uid === uid;
  const cls = `${mine ? "mine" : ""} ${m.type === "system" ? "system" : ""} ${m.type === "shout" ? "shout" : ""}`;
  return `
    <article class="msg ${cls}">
      <div class="bubble">
        ${m.type !== "system" ? `<div class="msg-name">${m.type === "shout" ? "👋 " : ""}${esc(m.nickname || "Someone")}</div>` : ""}
        <div class="msg-text">${esc(m.text || "")}</div>
        <div class="msg-time">${time(m.createdAt)} ${mine ? "✓" : ""}</div>
      </div>
    </article>`;
}

async function sendMessage(text, type){
  if(!state.profile.nickname) return askNickname(() => sendMessage(text,type));
  if(hasPhone(text)) return toast("Phone numbers are blocked. Keep contact inside the app.");
  const groupRef = doc(db,"groups",state.currentGroupId);
  const gs = await getDoc(groupRef);
  if(!gs.exists() || gs.data().status === "frozen") return toast("This group is frozen.");
  await addDoc(collection(db,"groups",state.currentGroupId,"messages"), {
    uid,
    nickname: state.profile.nickname,
    text,
    type,
    createdAt: serverTimestamp()
  });
  await updateDoc(groupRef, {updatedAt:serverTimestamp(), lastMessage:text.slice(0,80)});
  byId("message").value = "";
  await deleteDoc(doc(db,"groups",state.currentGroupId,"typing",uid)).catch(()=>{});
}

async function renderInvite(){
  const snap = await getDoc(doc(db,"groups",state.currentGroupId));
  if(!snap.exists()) return renderHome();
  const g = {id:snap.id, ...snap.data()};
  const link = makeJoinLink(g);
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=470x470&margin=12&data=${encodeURIComponent(link)}`;
  appEl.innerHTML = `
    ${bar("Member QR Invite", g.name, {back:"chat"})}
    <main class="screen">
      <section class="card">
        <div class="kicker">scan to join</div>
        <h2>${esc(g.name)}</h2>
        <p class="small">Members scan this, choose a nickname and join. No phone number.</p>
        <div class="qrbox"><img src="${qr}" alt="QR invite"></div>
        <div class="linkbox" id="inviteLink">${esc(link)}</div>
        <div class="grid" style="margin-top:10px">
          <button class="btn primary" id="copyInvite">Copy link</button>
          <button class="btn ghost" id="shareInvite">Share</button>
        </div>
      </section>
    </main>`;
  bind();
  byId("copyInvite").onclick = async () => { await copy(link); toast("Invite copied."); };
  byId("shareInvite").onclick = async () => {
    if(navigator.share) await navigator.share({title:g.name, text:"Join this no-number group chat:", url:link});
    else { await copy(link); toast("Invite copied."); }
  };
}

function renderCreator(){
  if(!state.creator){
    appEl.innerHTML = `
      ${bar("Creator Admin","Master control", {back:"home"})}
      <main class="screen">
        <section class="card">
          <h2>Creator sign in</h2>
          <p class="small">Demo PIN: <strong>0000</strong>. For real launch, use secure admin accounts and server-side roles.</p>
          <label for="pin">PIN</label>
          <input id="pin" type="password" inputmode="numeric">
          <button class="btn primary full" id="loginCreator" style="margin-top:12px">Open Creator Admin</button>
        </section>
      </main>`;
    bind();
    byId("loginCreator").onclick = () => {
      if(val("pin") !== CREATOR_PIN) return toast("Wrong PIN.");
      state.creator = true; localStorage.setItem("nn_creator","yes"); renderCreator();
    };
    return;
  }
  listenCreator();
}

function listenCreator(){
  clearSubs();
  state.unsub.push(onSnapshot(query(collection(db,"applications"), orderBy("createdAt","desc"), limit(50)), snap => {
    state.applications = snap.docs.map(d => ({id:d.id,...d.data()}));
    renderCreatorDashboard();
  }));
  state.unsub.push(onSnapshot(query(collection(db,"groups"), orderBy("updatedAt","desc"), limit(50)), snap => {
    state.groups = snap.docs.map(d => ({id:d.id,...d.data()}));
    renderCreatorDashboard();
  }));
}

function renderCreatorDashboard(){
  if(state.route !== "creator") return;
  const apps = state.applications.map(a => `
    <div class="card">
      <div class="row space"><h3>${esc(a.organisation || "Application")}</h3>${statusBadge(a.status || "pending")}</div>
      <p class="small"><strong>${esc(a.name || "")}</strong> · ${esc(a.contact || "")}</p>
      <p class="small"><strong>What they do:</strong> ${esc(a.whatTheyDo || "")}</p>
      <p class="small"><strong>Who it helps:</strong> ${esc(a.whoHelps || "")}</p>
      <p class="small"><strong>Reason:</strong> ${esc(a.reason || "")}</p>
      <div class="row wrap">
        <button class="btn soft" data-approve="${a.id}">Approve Good Cause</button>
        <button class="btn danger" data-reject="${a.id}">Reject</button>
      </div>
    </div>`).join("") || `<div class="card small">No applications yet.</div>`;
  const groups = state.groups.map(g => `
    <div class="card">
      <div class="row space"><h3>${esc(g.name)}</h3>${statusBadge(g.status || "active")}</div>
      <p class="small">${esc(g.description || "")}</p>
      <div class="row wrap">
        <button class="btn ghost" data-open-group="${g.id}">Open</button>
        <button class="btn warn" data-freeze="${g.id}">${g.status === "frozen" ? "Unfreeze" : "Freeze"}</button>
        <button class="btn ghost" data-reset="${g.id}">Reset QR</button>
      </div>
    </div>`).join("");
  appEl.innerHTML = `
    ${bar("Creator Dashboard","Approve · freeze · reset · control", {back:"home"})}
    <main class="screen">
      <section class="card">
        <div class="grid">
          <button class="btn primary" id="createGroup">Create group</button>
          <button class="btn ghost" id="logoutCreator">Log out</button>
        </div>
      </section>
      <h2>Applications</h2>${apps}
      <h2>Groups</h2>${groups}
    </main>`;
  bind();
  byId("createGroup").onclick = () => groupModal();
  byId("logoutCreator").onclick = () => { state.creator=false; localStorage.removeItem("nn_creator"); clearSubs(); listenHome(); renderHome(); };
  qsa("[data-approve]").forEach(b => b.onclick = () => approveApp(b.dataset.approve));
  qsa("[data-reject]").forEach(b => b.onclick = () => updateDoc(doc(db,"applications",b.dataset.reject), {status:"rejected", decidedAt:serverTimestamp()}));
  qsa("[data-freeze]").forEach(b => b.onclick = () => toggleFreeze(b.dataset.freeze));
  qsa("[data-reset]").forEach(b => b.onclick = () => resetQR(b.dataset.reset));
  qsa("[data-open-group]").forEach(b => b.onclick = () => openChat(b.dataset.openGroup));
}

async function approveApp(appId){
  const ref = doc(db,"applications",appId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const a = snap.data();
  await updateDoc(ref, {status:"approved", decidedAt:serverTimestamp()});
  await setDoc(doc(db,"admins",a.uid), {
    uid:a.uid, name:a.name, contact:a.contact, organisation:a.organisation,
    status:"good_cause", applicationId:appId, updatedAt:serverTimestamp()
  }, {merge:true});
  toast("Approved as Good Cause.");
}

async function renderApply(){
  appEl.innerHTML = `
    ${bar("Good Cause Access","Apply to run a group", {back:"home"})}
    <main class="screen">
      <section class="card">
        <div class="kicker">manual approval</div>
        <h2>Apply for group admin access</h2>
        <p class="small">Creator Admin chooses who is approved and can freeze access at any time.</p>
        <label>Your name</label><input id="name">
        <label>Contact email</label><input id="contact" type="email">
        <label>Group / organisation name</label><input id="org">
        <label>What do you do?</label><textarea id="what"></textarea>
        <label>Who does it help?</label><textarea id="who"></textarea>
        <label>Why are you asking for access?</label><textarea id="reason"></textarea>
        <div class="notice warn">Access is not automatic. Creator Admin can pause, freeze or revoke access.</div>
        <button class="btn primary full" id="sendApp">Submit application</button>
      </section>
    </main>`;
  bind();
  byId("sendApp").onclick = async () => {
    const data = {name:val("name"), contact:val("contact"), organisation:val("org"), whatTheyDo:val("what"), whoHelps:val("who"), reason:val("reason")};
    if(!data.name || !data.organisation || !data.whatTheyDo || !data.reason) return toast("Fill in name, group, what you do and reason.");
    if(hasPhone(Object.values(data).join(" "))) return toast("Please do not add phone numbers.");
    await addDoc(collection(db,"applications"), {...data, uid, status:"pending", createdAt:serverTimestamp()});
    state.route = "home"; listenHome(); renderHome(); toast("Application sent.");
  };
}

async function renderAdmin(){
  const adminSnap = await getDoc(doc(db,"admins",uid));
  if(!adminSnap.exists()){
    appEl.innerHTML = `${bar("Group Admin","Not approved yet", {back:"home"})}<main class="screen"><div class="notice warn">This device/account is not an approved admin yet. Submit a good-cause application, then approve it in Creator Admin.</div><button class="btn primary full" data-route="apply">Apply now</button></main>`;
    bind(); return;
  }
  const admin = adminSnap.data();
  if(["frozen","revoked","suspended"].includes(admin.status)){
    appEl.innerHTML = `${bar("Admin Frozen","Creator Admin control", {back:"home"})}<main class="screen"><div class="notice danger">Your admin access is ${esc(admin.status)}.</div></main>`;
    bind(); return;
  }
  const myGroupsSnap = await getDocs(query(collection(db,"groups"), where("adminUid","==",uid)));
  const groups = myGroupsSnap.docs.map(d => ({id:d.id,...d.data()}));
  appEl.innerHTML = `
    ${bar("Group Admin", admin.organisation || "Approved admin", {back:"home"})}
    <main class="screen">
      <section class="card">
        <h2>${esc(admin.name || "Admin")}</h2>
        <p class="small">${esc(admin.organisation || "")} · ${esc(admin.status || "")}</p>
        <button class="btn primary full" id="newGroup">Create group</button>
      </section>
      <section class="list">
        ${groups.map(g=>`<button class="item" data-admin-group="${g.id}"><div class="avatar">${initials(g.name)}</div><div class="item-main"><div class="item-title">${esc(g.name)}</div><div class="item-sub">${esc(g.status || "active")}</div></div>${statusBadge(g.status || "active")}</button>`).join("") || `<div class="card small">No groups yet.</div>`}
      </section>
    </main>`;
  bind();
  byId("newGroup").onclick = () => groupModal(uid);
  qsa("[data-admin-group]").forEach(b => b.onclick = () => openChat(b.dataset.adminGroup));
}

function groupModal(adminUid=""){
  showModal(`
    <h2>Create group</h2>
    <label>Group name</label><input id="gname" placeholder="Example: Friday Open Chat">
    <label>Description</label><textarea id="gdesc" placeholder="What is this group for?"></textarea>
    <button class="btn primary full" id="saveGroup" style="margin-top:12px">Create group</button>
    <button class="btn ghost full" id="closeModal" style="margin-top:8px">Cancel</button>
  `);
  byId("closeModal").onclick = closeModal;
  byId("saveGroup").onclick = async () => {
    const name = val("gname"), description = val("gdesc");
    if(!name) return toast("Add a group name.");
    if(hasPhone(name + " " + description)) return toast("No phone numbers.");
    const ref = await addDoc(collection(db,"groups"), {
      name, description, status:"active", inviteCode:makeCode(), adminUid:adminUid || uid,
      createdBy:uid, createdAt:serverTimestamp(), updatedAt:serverTimestamp(),
      rules:RULES, lastMessage:"Group created"
    });
    await addDoc(collection(db,"groups",ref.id,"messages"), {
      uid:"system", nickname:"Admin", type:"system", text:"Group created. Members join by QR using a nickname only.", createdAt:serverTimestamp()
    });
    closeModal();
    state.currentGroupId = ref.id; localStorage.setItem("nn_group", ref.id);
    state.route = "invite"; renderInvite();
  };
}

async function toggleFreeze(groupId){
  const ref = doc(db,"groups",groupId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const status = snap.data().status === "frozen" ? "active" : "frozen";
  await updateDoc(ref,{status, updatedAt:serverTimestamp()});
  toast(status === "frozen" ? "Group frozen." : "Group unfrozen.");
}

async function resetQR(groupId){
  await updateDoc(doc(db,"groups",groupId), {inviteCode:makeCode(), updatedAt:serverTimestamp()});
  toast("QR reset.");
}

function makeJoinLink(g){
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("join", g.id);
  url.searchParams.set("code", g.inviteCode);
  return url.toString();
}

function bar(title, sub="", opts={}){
  return `<header class="appbar">
    ${opts.back ? `<button class="back" data-route="${opts.back}">‹</button>` : ""}
    <div class="avatar">${initials(title)}</div>
    <div class="title-wrap"><div class="title">${esc(title)}</div><div class="sub">${esc(sub)}</div></div>
    ${opts.actions || ""}
  </header>`;
}

function bind(){
  qsa("[data-route]").forEach(b => b.onclick = () => {
    state.route = b.dataset.route;
    if(state.route === "home") listenHome();
    render();
  });
}

function askNickname(done){
  showModal(`
    <h2>Choose a nickname</h2>
    <p class="small">No phone number needed. This is what people see in chat.</p>
    <label>First name or nickname</label>
    <input id="nickModal" maxlength="32" placeholder="Example: Craig" value="${esc(state.profile.nickname || "")}">
    <button class="btn primary full" id="saveNick" style="margin-top:12px">Save</button>
  `);
  byId("saveNick").onclick = () => {
    const nick = val("nickModal");
    if(!nick) return toast("Add a nickname.");
    if(hasPhone(nick)) return toast("Use a nickname, not a number.");
    state.profile.nickname = nick; saveProfile(); closeModal();
    if(done) done(); else toast("Nickname saved.");
  };
}

function saveProfile(){ localStorage.setItem("nn_profile", JSON.stringify(state.profile)); }
function statusBadge(status){
  const s = status || "active";
  const cls = s === "active" || s === "approved" || s === "good_cause" ? "ok" : s === "pending" ? "warn" : "stop";
  return `<span class="badge ${cls}">${esc(s.replace("_"," "))}</span>`;
}
function val(id){ return (byId(id)?.value || "").trim(); }
function byId(id){ return document.getElementById(id); }
function qsa(sel){ return [...document.querySelectorAll(sel)]; }
function esc(str=""){ return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function initials(name=""){ return (String(name).trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("") || "?").toUpperCase(); }
function time(ts){ const d = ts?.toDate ? ts.toDate() : new Date(); return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); }
function toMillis(ts){ return ts?.toMillis ? ts.toMillis() : 0; }
function hasPhone(text){ return /(?:\+?\d[\s().-]*){9,}/.test(String(text)); }
function makeCode(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }
async function copy(text){ await navigator.clipboard.writeText(text).catch(()=>{}); }
function showModal(html){ const m=document.createElement("div"); m.className="modal-backdrop"; m.id="modal"; m.innerHTML=`<div class="modal">${html}</div>`; document.body.appendChild(m); m.onclick=e=>{if(e.target.id==="modal")closeModal();}; }
function closeModal(){ byId("modal")?.remove(); }
function toast(text){ byId("toast")?.remove(); const t=document.createElement("div"); t.id="toast"; t.className="toast"; t.textContent=text; document.body.appendChild(t); setTimeout(()=>t.remove(),2300); }
