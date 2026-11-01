"use strict";
const CFG = Object.assign({ GOOGLE_CLIENT_ID: "", REMINDER_MINUTES: 15, SITE_URL: "" }, window.HT_CONFIG);
const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const EMOJI = ["🦊","🐼","🦁","🐸","🐙","🦄","🐧","🐯","🦉","🐳","🌵","🌻"];

/* ---------- tiny helpers ---------- */
const $ = (s) => document.querySelector(s);
function h(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  kids.flat().forEach((c) => { if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c)); });
  return n;
}
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-7h6v7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.9C3.8 8.8 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  note: '<path d="M5 3h10l4 4v14H5zM15 3v4h4M8 12h8M8 16h6"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  out: '<path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9"/>',
};
function icon(n) { const s = h("span", { class: "ico", "aria-hidden": "true" }); s.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[n]}</svg>`; return s; }
const db = {
  get(k, d) { try { const v = localStorage.getItem("ht:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ht:" + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("ht:" + k); } catch {} },
};
function toast(msg) { const t = h("div", { class: "toast" }, msg); $("#toasts").append(t); setTimeout(() => t.remove(), 4500); }

/* ---------- dates ---------- */
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dkey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtTime = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function dayLabel(d) {
  const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5);
  return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short", day: "numeric" });
}

/* ---------- state ---------- */
const S = { session: db.get("session", null), data: null, tab: "home", query: "", openNote: null, mode: "signin", events: [], cal: "off", authErr: "" };
function loadData() {
  S.data = db.get("data:" + S.session.uid, null) || { habits: [], profile: {}, settings: { notify: false, lead: CFG.REMINDER_MINUTES } };
  S.data.settings ||= { notify: false, lead: CFG.REMINDER_MINUTES };
  S.data.profile ||= {};
  if (!Array.isArray(S.data.habits)) S.data.habits = [];
  S.data.habits.forEach((x) => { if (!x.done || typeof x.done !== "object") x.done = {}; });
}
const getUsers = () => { const u = db.get("users", []); return Array.isArray(u) ? u : []; };
const save = () => db.set("data:" + S.session.uid, S.data);
const myName = () => S.data.profile.name || S.session.name || "there";

/* ---------- auth (email accounts are stored on this device only) ---------- */
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function hashPw(pw, salt) {
  if (!window.crypto || !crypto.subtle) throw Error("Open the app with Live Server (http://127.0.0.1:5500) or an https link. Sign-up needs a secure page.");
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: unb64(salt), iterations: 100000, hash: "SHA-256" }, k, 256));
}
async function signUp(name, email, pw) {
  email = email.trim().toLowerCase();
  if (!name.trim()) throw Error("Enter your name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw Error("Enter a valid email address.");
  if (pw.length < 8) throw Error("Password must be at least 8 characters.");
  const users = getUsers();
  if (users.some((u) => u.email === email)) throw Error("An account with this email already exists. Sign in instead.");
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const u = { id: crypto.randomUUID(), name: name.trim(), email, salt, hash: await hashPw(pw, salt) };
  db.set("users", [...users, u]);
  startSession({ uid: u.id, name: u.name, email });
}
async function signIn(email, pw) {
  email = email.trim().toLowerCase();
  const u = getUsers().find((x) => x.email === email);
  if (!u || (await hashPw(pw, u.salt)) !== u.hash) throw Error("Incorrect email or password.");
  startSession({ uid: u.id, name: u.name, email });
}
function startSession(s) {
  db.set("session", s); S.session = s; S.tab = "home"; S.query = ""; loadData();
  S.cal = calToken() ? "loading" : "off"; render(); if (calToken()) loadEvents();
}
function signOut() {
  db.del("session"); sessionStorage.removeItem("ht:cal");
  S.session = null; S.data = null; S.events = []; S.cal = "off"; S.mode = "signin"; render();
}
function strongPassword(len = 16) {
  const sets = ["abcdefghijkmnopqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%^&*?-_"], all = sets.join("");
  const r = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const out = sets.map((s) => s[r(s.length)]);
  while (out.length < len) out.push(all[r(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = r(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join("");
}
function pwScore(p) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return p ? Math.max(1, s) : 0;
}

/* ---------- Google sign-in & Calendar ---------- */
function gClient(scope, cb) {
  if (!navigator.onLine) { toast("You're offline. Connect to the internet to use Google."); return null; }
  if (!CFG.GOOGLE_CLIENT_ID) { toast("Google isn't set up yet. Add your Client ID in config.js (see README)."); return null; }
  if (!window.google || !google.accounts) { toast("Google is still loading. Try again in a moment."); return null; }
  return google.accounts.oauth2.initTokenClient({ client_id: CFG.GOOGLE_CLIENT_ID, scope, callback: cb });
}
function setCalToken(r) { sessionStorage.setItem("ht:cal", JSON.stringify({ t: r.access_token, exp: Date.now() + (r.expires_in - 60) * 1000 })); }
function calToken() { try { const c = JSON.parse(sessionStorage.getItem("ht:cal")); return c && c.exp > Date.now() ? c.t : null; } catch { return null; } }
function googleSignIn() {
  const c = gClient("openid email profile " + CAL_SCOPE, async (r) => {
    if (r.error) { $("#autherr").textContent = "Google sign-in was cancelled."; return; }
    setCalToken(r);
    try {
      const p = await (await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + r.access_token } })).json();
      startSession({ uid: "g:" + p.sub, name: p.name || p.email, email: p.email, picture: p.picture });
    } catch { $("#autherr").textContent = "Could not read your Google profile. Try again."; }
  });
  if (c) c.requestAccessToken();
}
function connectCalendar() {
  const c = gClient(CAL_SCOPE, (r) => { if (r.error) return toast("Calendar was not connected."); setCalToken(r); loadEvents(); });
  if (c) c.requestAccessToken();
}
function disconnectCalendar() { sessionStorage.removeItem("ht:cal"); S.events = []; S.cal = "off"; render(); }
async function loadEvents() {
  const t = calToken();
  if (!S.session) return;
  if (!t) {
    const saved = db.get("events:" + S.session.uid, null);
    if (!navigator.onLine && Array.isArray(saved) && saved.length) { S.events = saved.map((e) => ({ ...e, start: new Date(e.start) })).filter((e) => e.start > new Date()); S.cal = "on"; }
    else { S.cal = "off"; S.events = []; }
    return refreshUI();
  }
  try {
    const q = new URLSearchParams({ timeMin: new Date().toISOString(), timeMax: addDays(new Date(), 7).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "25" });
    const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?" + q, { headers: { Authorization: "Bearer " + t } });
    if (!r.ok) throw Error(r.status);
    S.events = ((await r.json()).items || []).map((e) => ({
      id: e.id, title: e.summary || "(No title)", allDay: !e.start.dateTime,
      start: new Date(e.start.dateTime || e.start.date + "T00:00:00"), loc: e.location || "",
    }));
    S.cal = "on";
    db.set("events:" + S.session.uid, S.events);
  } catch {
    const saved = db.get("events:" + S.session.uid, null);
    if (Array.isArray(saved) && !navigator.onLine) { S.events = saved.map((e) => ({ ...e, start: new Date(e.start) })).filter((e) => e.start > new Date()); S.cal = "on"; }
    else S.cal = "error";
  }
  refreshUI(); checkReminders();
}
function refreshUI() { if (S.session && (S.tab === "home" || S.tab === "profile")) render(); }
function checkReminders() {
  if (!S.session || S.cal !== "on") return;
  const lead = (S.data.settings.lead || 15) * 60000, now = Date.now(), seen = db.get("seen", []);
  let changed = false;
  S.events.forEach((e) => {
    const id = e.id + e.start.getTime(), d = e.start - now;
    if (e.allDay || d <= 0 || d > lead || seen.includes(id)) return;
    seen.push(id); changed = true;
    const msg = `${e.title} starts at ${fmtTime(e.start)}`;
    toast("🔔 " + msg);
    if (S.data.settings.notify && "Notification" in window && Notification.permission === "granted") new Notification("Upcoming event", { body: msg });
  });
  if (changed) db.set("seen", seen.slice(-100));
}

/* ---------- habit logic ---------- */
function streak(hb) {
  const c = startOfDay(new Date());
  if (!hb.done[dkey(c)]) c.setDate(c.getDate() - 1);
  let n = 0;
  while (hb.done[dkey(c)]) { n++; c.setDate(c.getDate() - 1); }
  return n;
}
function addHabit(name, note) {
  S.data.habits.unshift({ id: crypto.randomUUID(), name: name.trim(), note: note.trim(), done: {}, created: Date.now() });
  save();
}
function toggleDone(hb) {
  const k = dkey(new Date());
  if (hb.done[k]) delete hb.done[k]; else hb.done[k] = true;
  save(); updateList();
}
function removeHabit(hb) {
  if (!confirm(`Delete "${hb.name}" and its history?`)) return;
  S.data.habits = S.data.habits.filter((x) => x.id !== hb.id); save(); updateList(); toast("Habit deleted.");
}
function stats() {
  const H = S.data.habits, today = new Date();
  const week = Array.from({ length: 7 }, (_, i) => { const d = addDays(today, i - 6); return { d, n: H.filter((x) => x.done[dkey(d)]).length }; });
  const rate = H.map((x) => { let c = 0; for (let i = 0; i < 30; i++) if (x.done[dkey(addDays(today, -i))]) c++; return { x, pct: Math.round((c / 30) * 100) }; });
  return {
    week, rate, count: H.length, total: week.reduce((s, w) => s + w.n, 0),
    best: Math.max(0, ...H.map(streak)), avg: rate.length ? Math.round(rate.reduce((s, r) => s + r.pct, 0) / rate.length) : 0,
  };
}

/* ---------- components ---------- */
function avatar(cls = "") {
  const a = S.data.profile.avatar, n = h("div", { class: "avatar " + cls });
  if (a && a.type === "img") n.append(h("img", { src: a.value, alt: "" }));
  else if (a && a.type === "emoji") n.append(a.value);
  else if (S.session.picture) n.append(h("img", { src: S.session.picture, alt: "", referrerpolicy: "no-referrer" }));
  else n.append(myName().charAt(0).toUpperCase());
  return n;
}
function pwField(id, label, suggest) {
  const inp = h("input", { id, name: id, type: "password", autocomplete: suggest ? "new-password" : "current-password", placeholder: "••••••••", required: true });
  const eye = h("button", { type: "button", class: "eye", "aria-label": "Show password", onclick: () => {
    const show = inp.type === "password"; inp.type = show ? "text" : "password";
    eye.replaceChildren(icon(show ? "eyeOff" : "eye")); eye.setAttribute("aria-label", show ? "Hide password" : "Show password");
  } }, icon("eye"));
  const wrap = h("div", { class: "field" }, h("label", { for: id }, label), h("div", { class: "pw" }, inp, eye));
  if (suggest) {
    const bar = h("i"), meter = h("div", { class: "meter" }, bar), hint = h("div", { class: "hint" }, "Use 12+ characters with mixed case, numbers and symbols.");
    const upd = () => { const s = pwScore(inp.value); bar.style.width = s * 25 + "%"; meter.dataset.s = s; hint.textContent = ["Use 12+ characters with mixed case, numbers and symbols.", "Weak password", "Fair password", "Good password", "Strong password"][s]; };
    inp.addEventListener("input", upd);
    const sug = h("button", { type: "button", class: "link", onclick: () => {
      inp.value = strongPassword(); inp.type = "text"; eye.replaceChildren(icon("eyeOff")); upd();
      toast("Strong password filled in. Save it in your password manager.");
    } }, icon("key"), "Suggest a strong password");
    wrap.append(meter, hint, sug);
  }
  return wrap;
}
function searchBox() {
  return h("label", { class: "search" }, icon("search"), h("input", { type: "search", placeholder: "Search habits and notes", value: S.query, "aria-label": "Search habits", oninput: (e) => { S.query = e.target.value; updateList(); } }));
}
function habitItem(hb, manage) {
  const done = !!hb.done[dkey(new Date())], n = streak(hb), editing = S.openNote === hb.id;
  const li = h("li", { class: "habit" + (done ? " is-done" : "") });
  li.append(h("div", { class: "h-main" },
    h("div", { class: "h-name" }, hb.name),
    h("div", { class: "h-meta" }, n ? `🔥 ${n} day streak` : "No streak yet"),
    hb.note && !editing ? h("div", { class: "h-note" }, hb.note) : null));
  const act = h("div", { class: "h-act" });
  if (!manage) act.append(h("button", { class: "done-btn", "aria-pressed": String(done), onclick: () => toggleDone(hb) }, done ? icon("check") : null, done ? "Done" : "Mark done"));
  act.append(h("button", { class: "sq", "aria-label": "Note for " + hb.name, title: "Note", onclick: () => { S.openNote = editing ? null : hb.id; updateList(); } }, icon("note")));
  if (manage) act.append(h("button", { class: "sq del", "aria-label": "Delete " + hb.name, title: "Delete", onclick: () => removeHabit(hb) }, icon("trash")));
  li.append(act);
  if (editing) {
    const ta = h("textarea", { "aria-label": "Note", placeholder: "Add a note, e.g. why it matters or what to remember" }, hb.note || "");
    li.append(h("div", { class: "note-edit" }, ta, h("div", {},
      h("button", { class: "btn teal", onclick: () => { hb.note = ta.value.trim(); S.openNote = null; save(); updateList(); toast("Note saved."); } }, "Save note"),
      h("button", { class: "btn ghost", onclick: () => { S.openNote = null; updateList(); } }, "Cancel"))));
  }
  return li;
}
function habitList(manage) {
  const q = S.query.trim().toLowerCase();
  const hs = S.data.habits.filter((x) => !q || x.name.toLowerCase().includes(q) || (x.note || "").toLowerCase().includes(q));
  const box = h("div", { id: "hlist" });
  if (!hs.length) box.append(h("p", { class: "empty" }, S.data.habits.length ? "No habits match your search." : manage ? "You haven't added any habits yet. Use the form above." : "No habits yet. Tap Add to create your first one."));
  else box.append(h("ul", { class: "list" }, hs.map((x) => habitItem(x, manage))));
  return box;
}
function updateList() { const o = $("#hlist"); if (o) o.replaceWith(habitList(S.tab === "add")); const hero = $("#hero"); if (hero) hero.replaceWith(heroCard()); const t = $("#count"); if (t) t.textContent = `Your habits (${S.data.habits.length})`; }
function heroCard() {
  const H = S.data.habits, k = dkey(new Date()), done = H.filter((x) => x.done[k]).length, p = H.length ? Math.round((done / H.length) * 100) : 0, best = Math.max(0, ...H.map(streak));
  return h("section", { class: "hero", id: "hero" },
    h("div", { class: "ring", style: `--p:${p}` }, h("span", {}, p + "%")),
    h("div", {}, h("h2", {}, H.length ? (done === H.length ? "All done for today!" : `${done} of ${H.length} done today`) : "Start your first habit"),
      h("p", {}, H.length ? `Best streak: ${best} day${best === 1 ? "" : "s"}` : "Tap Add to create a habit.")));
}
function eventsCard() {
  const c = h("section", { class: "card", id: "events" }, h("div", { class: "card-head" }, h("h2", {}, "Coming up"), icon("cal")));
  if (S.cal === "on") {
    if (!navigator.onLine) c.append(h("p", { class: "hint", style: "margin-bottom:.6rem" }, "You're offline. Showing your last saved events."));
    if (!S.events.length) c.append(h("p", { class: "empty" }, "No events in the next 7 days."));
    else {
      const lead = (S.data.settings.lead || 15) * 60000;
      c.append(h("ul", { class: "ev" }, S.events.map((e) => {
        const soon = !e.allDay && e.start - Date.now() > 0 && e.start - Date.now() <= lead;
        return h("li", { class: soon ? "soon" : "" }, h("div", { class: "chip-d" }, dayLabel(e.start)),
          h("div", {}, h("b", {}, e.title), h("small", {}, e.allDay ? "All day" : fmtTime(e.start), e.loc ? " · " + e.loc : "")));
      })));
    }
  } else {
    c.append(h("p", { class: "hint", style: "margin-bottom:.8rem" }, S.cal === "error" ? "Your Google session expired. Reconnect to see events." : "Connect Google Calendar to see planned events here and get reminders so you never forget them."));
    c.append(h("button", { class: "btn teal full", onclick: connectCalendar }, icon("cal"), S.cal === "error" ? "Reconnect calendar" : "Connect Google Calendar"));
  }
  return c;
}
let installEvt = null;
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function installCard() {
  if (isStandalone()) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const c = h("section", { class: "card install" }, h("div", { class: "card-head" }, h("h2", {}, "Install on your phone"), icon("download")));
  c.append(h("p", { class: "hint" }, "Add Habit Tracker to your home screen. It opens full screen and works offline."));
  if (installEvt) {
    c.append(h("button", { class: "btn teal full", style: "margin-top:.8rem", onclick: async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; refreshUI(); } }, icon("download"), "Install app"));
  } else if (ios) {
    c.append(h("ol", { class: "steps" }, h("li", {}, "Open this page in Safari."), h("li", {}, "Tap the Share button (the square with an arrow)."), h("li", {}, "Choose Add to Home Screen, then tap Add.")));
  } else {
    c.append(h("ul", { class: "steps" }, h("li", {}, "Android (Chrome): tap the ⋮ menu, then Install app or Add to Home screen."), h("li", {}, "Computer (Chrome or Edge): click the install icon at the right end of the address bar.")));
  }
  return c;
}
function siteUrl() { return CFG.SITE_URL || location.href.split("#")[0].replace(/index\.html$/, ""); }
function sharePanel(text) {
  const url = siteUrl(), e = encodeURIComponent;
  const links = [
    ["WhatsApp", "https://wa.me/?text=" + e(text + " " + url), "#25D366"],
    ["Telegram", `https://t.me/share/url?url=${e(url)}&text=${e(text)}`, "#229ED9"],
    ["X", `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}`, "#888"],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${e(url)}&quote=${e(text)}`, "#1877F2"],
    ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`, "#0A66C2"],
  ];
  const box = h("div", { class: "share" }, links.map(([n, href, c]) => h("a", { class: "sh", href, target: "_blank", rel: "noopener", style: `--c:${c}` }, n)));
  box.append(h("button", { class: "sh", onclick: async () => { try { await navigator.clipboard.writeText(text + " " + url); toast("Copied to clipboard."); } catch { toast("Could not copy. Copy the link from the address bar."); } } }, "Copy link"));
  if (navigator.share) box.append(h("button", { class: "sh", onclick: () => navigator.share({ title: "Habit Tracker", text, url }).catch(() => {}) }, "More…"));
  return box;
}

/* ---------- views ---------- */
function homeView() {
  const hr = new Date().getHours(), g = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  return h("div", { class: "home-grid" },
    h("div", { class: "col" },
      h("div", {}, h("h1", { class: "page-title" }, `${g}, ${myName().split(" ")[0]}`), h("p", { class: "page-sub" }, new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }))),
      heroCard(), searchBox(), h("h2", { class: "sect" }, "Today's habits"), habitList(false)),
    h("div", { class: "col side" }, eventsCard(), installCard()));
}
function addView() {
  const name = h("input", { type: "text", id: "hname", maxlength: "60", placeholder: "e.g. Drink 2L of water", required: true });
  const note = h("textarea", { id: "hnote", placeholder: "Optional note, e.g. why this matters" });
  const form = h("form", { class: "card", onsubmit: (e) => {
    e.preventDefault(); if (!name.value.trim()) return;
    addHabit(name.value, note.value); name.value = ""; note.value = ""; updateList(); toast("Habit added."); name.focus();
  } },
    h("div", { class: "field" }, h("label", { for: "hname" }, "Habit name"), name),
    h("div", { class: "field" }, h("label", { for: "hnote" }, "Note"), note),
    h("button", { class: "btn teal full", type: "submit" }, icon("plus"), "Add habit"));
  return h("div", { class: "two" },
    h("div", { class: "col" }, h("h1", { class: "page-title" }, "Add a habit"), h("p", { class: "page-sub" }, "Small and specific works best."), form),
    h("div", { class: "col" }, h("h2", { class: "sect", id: "count" }, `Your habits (${S.data.habits.length})`), searchBox(), habitList(true)));
}
function statsView() {
  const st = stats(), max = Math.max(1, st.count);
  const text = st.count ? `I completed ${st.total} habit check-ins this week and I'm on a ${st.best}-day streak on Habit Tracker 🔥` : "I'm building better habits with Habit Tracker 🔥";
  return h("div", { class: "col" },
    h("h1", { class: "page-title" }, "Analytics"), h("p", { class: "page-sub" }, "Your last 7 and 30 days."),
    h("div", { class: "tiles" }, [[st.best, "Best streak"], [st.total, "This week"], [st.avg + "%", "30-day rate"]].map(([v, l]) => h("div", { class: "tile" }, h("b", {}, String(v)), h("span", {}, l)))),
    h("div", { class: "two" },
      h("section", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, "Last 7 days")),
        h("div", { class: "bars" }, st.week.map((w, i) => h("div", { class: "bar" + (i === 6 ? " today" : "") }, h("div", { style: `height:${(w.n / max) * 100}%` }), h("span", {}, w.d.toLocaleDateString([], { weekday: "short" })))))),
      h("section", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, "Habit consistency (30 days)")),
        st.rate.length ? st.rate.map((r) => h("div", { class: "rate" }, h("div", {}, h("span", {}, r.x.name), h("b", {}, r.pct + "%")), h("div", { class: "track" }, h("i", { style: `width:${r.pct}%` })))) : h("p", { class: "empty" }, "Add a habit to see your stats."))),
    h("section", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, "Share your progress"), icon("share")), h("p", { class: "hint", style: "margin-bottom:.8rem" }, text), sharePanel(text)));
}
function profileView() {
  const p = S.data.profile, st = S.data.settings;
  const nameIn = h("input", { type: "text", id: "pname", value: myName(), maxlength: "40", onchange: (e) => { p.name = e.target.value.trim(); save(); toast("Name saved."); } });
  const file = h("input", { type: "file", accept: "image/*", hidden: true, onchange: (e) => pickPhoto(e.target.files[0]) });
  const lead = h("select", { id: "lead", onchange: (e) => { st.lead = +e.target.value; save(); toast("Reminder time saved."); } },
    [5, 15, 30, 60].map((m) => h("option", { value: m, selected: st.lead === m }, `${m} minutes before`)));
  return h("div", { class: "col" },
    h("h1", { class: "page-title" }, "Profile"),
    h("section", { class: "card" },
      h("div", { class: "row-s" }, avatar("lg"), h("div", {}, h("b", {}, myName()), h("div", { class: "hint" }, S.session.email || ""))),
      h("div", { class: "field" }, h("label", { for: "pname" }, "Display name"), nameIn),
      h("p", { class: "hint", style: "margin-bottom:.5rem" }, "Pick an avatar or upload your own photo."),
      h("div", { class: "emojis" }, EMOJI.map((e) => h("button", { type: "button", class: p.avatar && p.avatar.value === e ? "on" : "", "aria-label": "Avatar " + e, onclick: () => { p.avatar = { type: "emoji", value: e }; save(); render(); } }, e))),
      h("div", { class: "row-s" }, file,
        h("button", { class: "btn ghost", onclick: () => file.click() }, "Upload photo"),
        p.avatar ? h("button", { class: "link", onclick: () => { delete p.avatar; save(); render(); } }, "Remove avatar") : null)),
    h("section", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, "Calendar & reminders"), icon("cal")),
      h("div", { class: "row-s" }, h("span", { class: "status" }, S.cal === "on" ? "Google Calendar connected" : "Google Calendar not connected"),
        S.cal === "on" ? h("button", { class: "btn ghost", onclick: disconnectCalendar }, "Disconnect") : h("button", { class: "btn teal", onclick: connectCalendar }, "Connect")),
      h("div", { class: "row-s" }, h("span", { class: "status" }, st.notify ? "Browser notifications on" : "Browser notifications off"),
        h("button", { class: "btn ghost", onclick: toggleNotify }, st.notify ? "Turn off" : "Turn on")),
      h("div", { class: "field" }, h("label", { for: "lead" }, "Remind me"), lead),
      h("p", { class: "hint" }, "Reminders appear while this app is open in a browser tab.")),
    installCard(),
    h("section", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, "Share Habit Tracker"), icon("share")), sharePanel("Check out Habit Tracker, a simple way to build daily habits.")),
    h("button", { class: "btn ghost", onclick: signOut }, icon("out"), "Sign out"));
}
function toggleNotify() {
  const st = S.data.settings;
  if (st.notify) { st.notify = false; save(); return render(); }
  if (!("Notification" in window)) return toast("This browser doesn't support notifications.");
  Notification.requestPermission().then((r) => { st.notify = r === "granted"; save(); if (!st.notify) toast("Notifications are blocked. Allow them in your browser's site settings."); render(); });
}
function pickPhoto(f) {
  if (!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    const im = new Image();
    im.onload = () => {
      const s = Math.min(im.width, im.height), c = h("canvas", { width: 160, height: 160 });
      c.getContext("2d").drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 160, 160);
      S.data.profile.avatar = { type: "img", value: c.toDataURL("image/jpeg", 0.8) }; save(); render();
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(f);
}
function authView() {
  const up = S.mode === "signup";
  const form = h("form", { onsubmit: async (e) => {
    e.preventDefault(); const f = e.target, v = (n) => (f.elements[n] ? f.elements[n].value : "");
    try { if (up) await signUp(v("name"), v("email"), v("pw")); else await signIn(v("email"), v("pw")); }
    catch (err) { $("#autherr").textContent = err.message; }
  } },
    up ? h("div", { class: "field" }, h("label", { for: "name" }, "Name"), h("input", { type: "text", id: "name", name: "name", autocomplete: "name", required: true })) : null,
    h("div", { class: "field" }, h("label", { for: "email" }, "Email"), h("input", { type: "email", id: "email", name: "email", autocomplete: "email", required: true })),
    pwField("pw", "Password", up),
    h("div", { class: "err", id: "autherr", role: "alert" }),
    h("button", { class: "btn teal full", type: "submit" }, up ? "Create account" : "Sign in"));
  return h("div", { class: "auth" },
    h("div", { class: "auth-brand" }, h("h1", {}, "Small checks.", h("br"), "Big change."), h("p", {}, "Track daily habits, keep your streaks alive and never miss an event from your calendar.")),
    h("div", { class: "auth-form" }, h("div", { class: "auth-box" },
      h("h2", {}, up ? "Create your account" : "Welcome back"),
      h("div", { class: "tabs", role: "tablist" },
        h("button", { class: up ? "" : "on", onclick: () => { S.mode = "signin"; render(); } }, "Sign in"),
        h("button", { class: up ? "on" : "", onclick: () => { S.mode = "signup"; render(); } }, "Sign up")),
      h("button", { class: "btn google", type: "button", onclick: googleSignIn }, "Continue with Google"),
      h("div", { class: "or" }, "or use email"), form)));
}
function shell() {
  const view = { home: homeView, add: addView, stats: statsView, profile: profileView }[S.tab]();
  const tabs = [["home", "Home", "home"], ["add", "Add", "plus"], ["stats", "Analytics", "chart"]];
  return h("div", { class: "shell" },
    h("header", { class: "topbar" }, h("div", { class: "brand" }, h("i", {}, "✓"), "Habit Tracker"),
      h("button", { class: "avatar-btn", "aria-label": "Open profile", onclick: () => go("profile") }, avatar())),
    h("main", {}, view),
    h("nav", { class: "nav", "aria-label": "Main" }, tabs.map(([id, l, ic]) => h("button", { class: S.tab === id ? "on" : "", "aria-current": S.tab === id ? "page" : null, onclick: () => go(id) }, icon(ic), h("span", {}, l)))));
}
function go(tab) { S.tab = tab; S.openNote = null; S.query = ""; render(); window.scrollTo(0, 0); }
function render() { $("#app").replaceChildren(S.session ? shell() : authView()); }

/* ---------- boot ---------- */
if (S.session) { loadData(); S.cal = calToken() ? "loading" : "off"; }
render();
if (S.session && calToken()) loadEvents();
setInterval(checkReminders, 30000);
setInterval(() => { if (S.session && calToken()) loadEvents(); }, 300000);

/* ---------- install + offline ---------- */
const offlineBar = h("div", { id: "offline", hidden: true, role: "status" }, "You're offline. Your habits still work and are saved on this device.");
document.body.append(offlineBar);
const syncNet = () => { offlineBar.hidden = navigator.onLine; };
window.addEventListener("online", () => { syncNet(); toast("Back online."); if (S.session && calToken()) loadEvents(); });
window.addEventListener("offline", syncNet);
syncNet();
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; refreshUI(); });
window.addEventListener("appinstalled", () => { installEvt = null; toast("App installed 🎉"); refreshUI(); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
