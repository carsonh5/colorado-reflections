/* ============================================================
   COLORADO REFLECTIONS — self-serve app engine
   Firebase (Auth + Firestore) · hydrate · inline WYSIWYG edit · bookings
   Loaded as a module. Public-safe config in firebase-config.js.
   ------------------------------------------------------------
   Model: one Firestore doc  sites/colorado-reflections  holds ALL content.
   Public reads it and hydrates the page. Owners (allowlisted emails) log in,
   toggle Edit mode, click anything on the page to change it, and Save.
   Photos are compressed client-side and stored as data URLs in the doc
   (free — no Firebase Storage / billing needed).
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut, GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, updateDoc, collection, addDoc, getDocs,
  query, orderBy, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const SITE_ID = "colorado-reflections";
const OWNERS = ["corefmobiledetail@gmail.com", "carsonhanna5@gmail.com"];

const app = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const siteRef = doc(db, "sites", SITE_ID);

/* ------------------------------------------------------------
   DEFAULT CONTENT — this is both the fallback AND the seed.
   Every editable value on the page lives here. Repeatable lists
   (packages, addons, gallery, reviews, cities) are arrays.
   ------------------------------------------------------------ */
const DEFAULT_CONTENT = {
  business: {
    name: "Colorado Reflections",
    nameSub: "Mobile Detail",
    phone: "(303) 589-8214",
    email: "corefmobiledetail@gmail.com",
    license: "86-1229005",
    owner: "James"
  },
  hero: {
    headline: "Showroom finish.",
    em: "Your driveway.",
    sub: "Interior and exterior detailing for cars, trucks, boats and RVs — done at your home or office in Thornton, Northglenn, Westminster, Broomfield, Arvada and Federal Heights.",
    mark: "Mobile detailing  ·  20+ years  ·  Thornton · Northglenn · Westminster · Broomfield · Arvada · Federal Heights",
    photo: "./images/hero.jpg"
  },
  brand: { accent: "#E5362E" },
  pricingLead: "Pick a package, add your vehicle and any extras, and your price updates as you go — no waiting on a callback. We confirm the final number after a couple of quick photos.",
  packages: [
    { id: "basic", name: "Basic Interior", price: 60, desc: "", list: ["Full interior vacuum & wipe-down", "Windows, dash & console cleaned", "Door jambs & trash-out", "Light deodorize"] },
    { id: "gold", name: "Full Detail", price: 160, featured: true, tag: "Most chosen", list: ["Full interior clean & shampoo", "Exterior hand wash", "Clay bar & leather care", "Hand wax & wheels dressed"] },
    { id: "platinum", name: "Buff & Ceramic", price: 290, tag: "Best protection", desc: "", list: ["Everything in Full Detail", "Paint correction buff", "Engine bay cleaning", "Ceramic sealant & showroom finish"] }
  ],
  vehicles: [
    { id: "sedan", label: "Sedan", add: 0 },
    { id: "suv", label: "SUV", add: 30 },
    { id: "truck", label: "Truck", add: 50 },
    { id: "xl", label: "Oversized", add: 70 }
  ],
  addons: [
    { id: "pethair", label: "Pet hair removal", add: 40 },
    { id: "stains", label: "Shampoo & stain extraction", add: 50 },
    { id: "protect", label: "Fabric & leather protection", add: 45 },
    { id: "engine", label: "Engine bay cleaning", add: 50 }
  ],
  included: { basic: [], gold: [], platinum: ["engine"] },
  workHeading: "Your vehicle could look like this.",
  gallery: [
    { src: "./images/gal-1.jpg", cap: "Wash, full buff & ceramic wax" },
    { src: "./images/gal-2.jpg", cap: "Complete interior, shampoo & leather care" },
    { src: "./images/gal-3.jpg", cap: "Full buff, ceramic wax & engine bay" },
    { src: "./images/gal-4.jpg", cap: "Seats & floor, deep cleaned" },
    { src: "./images/gal-5.jpg", cap: "Motorhome — decal removal & buff" },
    { src: "./images/gal-6.jpg", cap: "Malibu wake boat — full buff" }
  ],
  story: {
    over: "From the owner",
    quote: "It started back in 1998 — I was a kid at my grandfather's mechanic shop, cleaning out the vehicles. For the next seven years that's what I did, detailing interiors. In 2004 I picked up a buffer, polishing for custom painters, and little by little I've mastered nearly every technique. Now I bring all of it to your driveway.",
    cite: "James · Owner, Colorado Reflections"
  },
  reviews: [
    { name: "A Lakewood neighbor", text: "James @ Colorado Reflections — highly recommend.", source: "Nextdoor recommendation" }
  ],
  area: {
    lead: "Fully mobile across the north Denver metro — Thornton, Northglenn, Westminster, Broomfield, Arvada, Federal Heights and the nearby suburbs. Your driveway, your office lot, wherever the vehicle sits. Cars, boats, RVs and motorcycles, seven days a week. Just outside the ring? Call us — we often still make it work.",
    cities: ["Thornton", "Northglenn", "Westminster", "Broomfield", "Arvada", "Federal Heights"]
  },
  hours: "Mon–Fri 9:00a–7:30p · Sat 10:00a–7:30p · Sun 11:00a–7:30p · By appointment.",
  social: { ig: "Colorado_reflections_detail", fb: "", yelp: "https://www.yelp.com/biz/colorado-reflections-mobile-detail-denver", nextdoor: "", igFeedOn: false },
  booking: { notifyEmail: "carsonhanna5@gmail.com", photoUploadOn: true, payLink: "", payLabel: "Pay a deposit to lock your spot", payOn: false, emailjs: { serviceId: "service_qj7j8hm", templateId: "template_e0co2tf", publicKey: "uTfhhwQkCNGvQdNli" } },
  availability: {
    slotMode: "windows",
    slots: ["Morning (9–12)", "Midday (12–3)", "Afternoon (3–7)"],
    openDays: [true, true, true, true, true, true, true], // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
    vacations: [],   // [{ start:"2026-08-20", end:"2026-08-25", label:"Out of town" }]
    blocked: [],     // [{ date:"2026-08-14", slot:"Morning (9–12)" }]  (slot omitted = whole day)
    leadDays: 0,
    horizonDays: 60
  },
  sections: { pricing: true, work: true, story: true, reviews: false, area: true, igfeed: false },
  seo: {
    title: "Mobile Car Detailing in Thornton, Northglenn & Westminster — Colorado Reflections",
    desc: "Colorado Reflections brings interior and exterior detailing to your home or office across Denver's north metro. Cars, boats, RVs & motorcycles. 20+ years, owner-operated."
  }
};

/* ---------- state ---------- */
let content = null;        // live content object
let editMode = false;
let currentUser = null;
let dirty = false;

/* ============================================================
   LOAD + HYDRATE
   ============================================================ */
async function load() {
  try {
    const snap = await getDoc(siteRef);
    content = snap.exists() ? deepMerge(structuredClone(DEFAULT_CONTENT), snap.data()) : structuredClone(DEFAULT_CONTENT);
  } catch (e) {
    console.warn("Firestore read failed, using defaults:", e);
    content = structuredClone(DEFAULT_CONTENT);
  }
  hydrate();
  mountOwnerBar();
  maybeShowTrack();
  const mb = document.getElementById("myBookingsLink");
  if (mb) mb.onclick = (e) => { e.preventDefault(); openMyBookings(); };
}

function deepMerge(base, over) {
  for (const k in over) {
    if (over[k] && typeof over[k] === "object" && !Array.isArray(over[k]) && typeof base[k] === "object" && !Array.isArray(base[k])) {
      deepMerge(base[k], over[k]);
    } else if (over[k] !== undefined) {
      base[k] = over[k];
    }
  }
  return base;
}

function setText(field, value) {
  document.querySelectorAll(`[data-field="${field}"]`).forEach(el => { el.textContent = value; });
}

/* map content → DOM (the index.html carries data-field hooks that match these) */
function hydrate() {
  const c = content;

  // SEO
  if (c.seo?.title) document.title = c.seo.title;
  const md = document.querySelector('meta[name="description"]');
  if (md && c.seo?.desc) md.setAttribute("content", c.seo.desc);

  // accent
  document.documentElement.style.setProperty("--accent", c.brand.accent);

  // business identity
  document.querySelectorAll('[data-field="business.name"]').forEach(el => el.childNodes[0] && (el.childNodes[0].textContent = c.business.name + " "));
  setText("business.nameSub", c.business.nameSub);
  document.querySelectorAll('[data-phone]').forEach(el => {
    el.setAttribute("href", "tel:+1" + c.business.phone.replace(/\D/g, ""));
    if (el.hasAttribute("data-phone-text")) el.textContent = "Call or Text " + c.business.phone;
  });
  setText("business.phonePlain", c.business.phone);
  document.querySelectorAll('[data-email]').forEach(el => { el.setAttribute("href", "mailto:" + c.business.email); el.textContent = c.business.email; });
  setText("business.license", "Lic. " + c.business.license);

  // hero
  setText("hero.headline", c.hero.headline);
  setText("hero.em", c.hero.em);
  setText("hero.sub", c.hero.sub);
  setText("hero.mark", c.hero.mark);
  const heroImg = document.querySelector('[data-field="hero.photo"]');
  if (heroImg) heroImg.src = c.hero.photo;

  setText("pricingLead", c.pricingLead);
  setText("workHeading", c.workHeading);
  setText("area.lead", c.area.lead);
  setText("hours", c.hours);

  // packages, addons, gallery, reviews, cities: rendered by dedicated renderers
  renderPackages();
  renderVehicles();
  renderAddons();
  renderTimeSlots();
  renderGallery();
  renderStory();
  renderReviews();
  renderCities();
  applySectionVisibility();
  renderSocial();
  tagStaticText();
  window.__CR_recomputeQuote && window.__CR_recomputeQuote();
}

/* ---- renderers (also used to re-render after edits) ---- */
function renderPackages() {
  const wrap = document.querySelector("#pkgTiers");
  const strip = document.querySelector("#pkgCompare");
  if (wrap) {
    wrap.innerHTML = content.packages.map((p, pi) => `
      <label class="tier cr-removable${p.featured ? " tier-feature" : ""}" data-pkg="${p.id}" data-remove="packages.${pi}">
        <input type="radio" name="pkg" value="${p.id}" data-base="${p.price}" />
        ${p.tag ? `<span class="tier-tag">${esc(p.tag)}</span>` : ""}
        <span class="tier-head">
          <span class="tier-name" data-edit="packages.${pi}.name">${esc(p.name)}</span>
          <span class="tier-price">from <b>$<span data-edit="packages.${pi}.price">${p.price}</span></b></span>
        </span>
        <span class="tier-list">${p.list.map((li, i) => `<span data-edit="packages.${pi}.list.${i}">${esc(li)}</span>`).join("")}</span>
      </label>`).join("");
  }
  if (strip) {
    strip.innerHTML = content.packages.map(p => `
      <div class="compare-col${p.featured ? " compare-col-featured" : ""}">
        ${p.tag ? `<span class="compare-badge">${esc(p.tag)}</span>` : ""}
        <p class="compare-name">${esc(p.name)}</p>
        <p class="compare-price">From $${p.price}</p>
      </div>`).join("");
  }
}
function renderVehicles() {
  const seg = document.querySelector("#vehSeg");
  if (!seg) return;
  seg.innerHTML = content.vehicles.map((v, i) => `
    <label><input type="radio" name="veh" value="${v.id}" data-add="${v.add}" ${i === 0 ? "checked" : ""}/><span>${esc(v.label)}</span></label>`).join("");
}
function renderTimeSlots() {
  const seg = document.querySelector("#bkTime");
  if (!seg) return;
  const slots = (content.availability && content.availability.slots) || [];
  seg.className = slots.length > 4 ? "seg seg-wrap" : "seg seg-" + Math.min(4, Math.max(1, slots.length));
  seg.innerHTML = slots.map(s => `
    <label><input type="radio" name="bktime" value="${esc(s)}" /><span>${esc(s)}</span></label>`).join("");
}
function renderAddons() {
  const ex = document.querySelector("#addonList");
  if (!ex) return;
  ex.innerHTML = content.addons.map((a, ai) => `
    <label class="ex cr-removable" data-remove="addons.${ai}"><input type="checkbox" name="ex" data-key="${a.id}" data-add="${a.add}" />
      <span><span data-edit="addons.${ai}.label">${esc(a.label)}</span> <b data-price="+$${a.add}" data-edit="addons.${ai}.add">+$${a.add}</b></span></label>`).join("");
}
function renderGallery() {
  const g = document.querySelector("#workGrid");
  if (!g) return;
  g.innerHTML = content.gallery.map((ph, i) => `
    <figure class="cr-removable" data-gindex="${i}" data-remove="gallery.${i}"><img src="${esc(ph.src)}" alt="${esc(ph.cap || "")}" />
      <figcaption data-edit="gallery.${i}.cap">${esc(ph.cap || "")}</figcaption></figure>`).join("");
  window.__CR_bindLightbox && window.__CR_bindLightbox();
}
function renderStory() {
  setText("story.over", content.story.over);
  setText("story.quote", content.story.quote);
  setText("story.cite", content.story.cite);
}
function renderReviews() {
  const r = document.querySelector("#reviewList");
  if (!r) return;
  r.innerHTML = content.reviews.map((rv, i) => `
    <blockquote class="rev-card cr-removable" data-remove="reviews.${i}"><p data-edit="reviews.${i}.text">${esc(rv.text)}</p>
      <footer>— <span data-edit="reviews.${i}.name">${esc(rv.name)}</span>${rv.source ? ` · ${esc(rv.source)}` : ""}</footer></blockquote>`).join("");
}
function renderCities() {
  const ul = document.querySelector("#areaCities");
  if (!ul) return;
  ul.innerHTML = content.area.cities.map((c, i) => `<li class="cr-removable" data-remove="area.cities.${i}" data-edit="area.cities.${i}">${esc(c)}</li>`).join("");
}
function safeUrl(u) {
  try { const x = new URL(u, location.href); return (x.protocol === "https:" || x.protocol === "http:") ? x.href : ""; }
  catch { return ""; }
}
function renderSocial() {
  const box = document.querySelector("#socialLinks");
  if (box) {
    box.textContent = "";                         // clear without innerHTML sink
    const s = content.social;
    const add = (url, label) => {
      const u = safeUrl(url); if (!u) return;      // protocol allowlist blocks javascript: etc.
      const a = document.createElement("a");
      a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = label;
      box.appendChild(a);
    };
    if (s.ig) add("https://instagram.com/" + String(s.ig).replace(/^@/, "").replace(/[^A-Za-z0-9_.]/g, ""), "Instagram");
    if (s.fb) add(s.fb, "Facebook");
    if (s.yelp) add(s.yelp, "Yelp");
    if (s.nextdoor) add(s.nextdoor, "Nextdoor");
  }
  // IG feed
  const feed = document.querySelector("#igFeed");
  if (feed) feed.hidden = !(content.social.igFeedOn && content.social.ig);
}
function applySectionVisibility() {
  const map = { pricing: "#pricing", work: "#work", story: "#story", reviews: "#reviewsSection", area: "#area", igfeed: "#igFeed" };
  for (const key in map) {
    const el = document.querySelector(map[key]);
    if (el) el.hidden = !content.sections[key];
  }
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* ============================================================
   BOOKINGS  (public create → Firestore + optional EmailJS)
   ============================================================ */
export async function submitBooking(payload) {
  const record = { ...payload, site: SITE_ID, status: "new", created: serverTimestamp() };
  let id = null;
  try {
    const ref = await addDoc(collection(db, "sites", SITE_ID, "bookings"), record);
    id = ref.id;
  } catch (e) { console.warn("Booking save failed:", e); }
  // optional email via EmailJS if configured
  const ej = content?.booking?.emailjs;
  if (ej && ej.serviceId && ej.templateId && ej.publicKey && window.emailjs) {
    try {
      const title = "New booking — " + (payload.name || "");
      const message = [
        (payload.name || "") + (payload.phone ? " · " + payload.phone : ""),
        payload.email ? "Email: " + payload.email : "",
        (payload.package || "") + (payload.vehicle ? " · " + payload.vehicle : "") + (payload.estimate ? " — " + payload.estimate : ""),
        payload.addons ? "Add-ons: " + payload.addons : "",
        payload.date ? "Date: " + payload.date + " " + (payload.time || "") : (payload.time ? "Time: " + payload.time : ""),
        payload.address ? "Where: " + payload.address : ""
      ].filter(Boolean).join("\n");
      await window.emailjs.send(ej.serviceId, ej.templateId,
        { to_email: content.booking.notifyEmail, name: payload.name || "", email: payload.email || "", title: title, message: message },
        { publicKey: ej.publicKey });
    } catch (e) { console.warn("EmailJS failed:", e); }
  }
  return id;
}
window.__CR_submitBooking = submitBooking;

/* ---- availability: date limits + per-date slot status (pure, reads content.availability) ---- */
function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function availCfg() {
  const a = (content && content.availability) || {};
  return {
    slots: a.slots || [],
    openDays: a.openDays || [true, true, true, true, true, true, true],
    vacations: a.vacations || [],
    blocked: a.blocked || [],
    leadDays: Number(a.leadDays) || 0,
    horizonDays: Number(a.horizonDays) || 60
  };
}
function dateLimits() {
  const a = availCfg();
  const min = new Date(); min.setHours(0, 0, 0, 0); min.setDate(min.getDate() + a.leadDays);
  const max = new Date(); max.setHours(0, 0, 0, 0); max.setDate(max.getDate() + a.horizonDays);
  return { min: ymd(min), max: ymd(max) };
}
function dayStatus(dateStr) {
  const a = availCfg();
  if (!dateStr) return { open: true, reason: "" };
  const lim = dateLimits();
  if (dateStr < lim.min) return { open: false, reason: "That date has passed — pick an upcoming day." };
  if (dateStr > lim.max) return { open: false, reason: "That's further out than we book right now." };
  const dow = new Date(dateStr + "T00:00:00").getDay();
  if (!a.openDays[dow]) return { open: false, reason: "We're closed that day — please pick another." };
  const vac = a.vacations.find(v => v && v.start && v.end && dateStr >= v.start && dateStr <= v.end);
  if (vac) return { open: false, reason: (vac.label ? vac.label + " — " : "") + "we're out that day. Pick another date." };
  return { open: true, reason: "" };
}
function slotIsBlocked(dateStr, slot) {
  const a = availCfg();
  return a.blocked.some(b => b && b.date === dateStr && (!b.slot || b.slot === slot));
}
// public bridge: what can this customer book on this date?
window.__CR_bookingAvail = function (dateStr) {
  const a = availCfg();
  const st = dayStatus(dateStr);
  const slots = a.slots.map(s => ({ label: s, available: st.open && !slotIsBlocked(dateStr, s) }));
  let open = st.open, reason = st.reason;
  // if the day is technically open but every slot is taken, treat it as fully booked
  if (open && dateStr && slots.length && slots.every(s => !s.available)) {
    open = false; reason = "That day's fully booked — please pick another.";
  }
  return { open, reason, slots };
};
window.__CR_dateLimits = dateLimits;

/* ---- track-your-booking: capability link ?track=<id> (unguessable id = access) ---- */
async function maybeShowTrack() {
  const m = /[?&]track=([A-Za-z0-9_-]+)/.exec(location.search);
  if (!m) return;
  try {
    const snap = await getDoc(doc(db, "sites", SITE_ID, "bookings", m[1]));
    if (!snap.exists()) return;
    const b = snap.data();
    const d = drawer("Your booking", "");
    const body = d.querySelector(".crd-body");
    const row = (k, v) => { if (!v) return; const p = document.createElement("div"); p.className = "trk-row"; const a = document.createElement("b"); a.textContent = k; const s = document.createElement("span"); s.textContent = v; p.append(a, s); body.appendChild(p); };
    const status = document.createElement("div"); status.className = "trk-status trk-" + (b.status || "new"); status.textContent = ({ new: "Requested — we'll confirm shortly", confirmed: "Confirmed", done: "Completed" })[b.status || "new"]; body.appendChild(status);
    row("Name", b.name); row("Package", b.package); row("Vehicle", b.vehicle);
    row("Estimate", b.estimate); row("Date", b.date); row("Time", b.time); row("Where", b.address);
    const call = document.createElement("a"); call.className = "crbtn crbtn-primary"; call.href = "tel:+1" + (content?.business?.phone || "").replace(/\D/g, ""); call.textContent = "Call us"; body.appendChild(call);
  } catch (e) { console.warn("track failed", e); }
}

/* ---- customer accounts: "My bookings" via Google sign-in (sees only their own) ---- */
async function openMyBookings() {
  let user = auth.currentUser;
  if (!user) {
    try { const res = await signInWithPopup(auth, new GoogleAuthProvider()); user = res.user; }
    catch (e) { return; }  // cancelled / popup blocked
  }
  const d = drawer("My bookings", `<div id="myBk">Loading…</div>`);
  const list = d.querySelector("#myBk");
  try {
    const snap = await getDocs(query(collection(db, "sites", SITE_ID, "bookings"), where("email", "==", user.email)));
    list.textContent = "";
    const who = document.createElement("p"); who.className = "hint"; who.style.cssText = "color:#9aa;font-size:.8rem;margin:0 0 12px"; who.textContent = "Signed in as " + user.email; list.appendChild(who);
    if (snap.empty) { const e = document.createElement("div"); e.textContent = "No bookings yet under this email. Book a detail and it'll show up here."; list.appendChild(e); }
    else {
      const rows = []; snap.forEach(s => rows.push(s.data()));
      rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      rows.forEach(b => {
        const card = document.createElement("div"); card.className = "bk-card";
        const st = document.createElement("span"); st.className = "bk-badge bk-" + (b.status || "new");
        st.textContent = ({ new: "Requested", confirmed: "Confirmed", done: "Done" })[b.status || "new"]; card.appendChild(st);
        const line = (k, v) => { if (!v) return; const p = document.createElement("div"); const a = document.createElement("b"); a.textContent = k + ": "; const s = document.createElement("span"); s.textContent = v; p.append(a, s); card.appendChild(p); };
        line("Package", b.package); line("Vehicle", b.vehicle); line("Estimate", b.estimate);
        line("Date", b.date); line("Time", b.time); line("Where", b.address);
        list.appendChild(card);
      });
    }
    const out = document.createElement("button"); out.className = "crbtn"; out.style.marginTop = "12px"; out.textContent = "Sign out";
    out.onclick = () => { signOut(auth).then(() => d.remove()); }; list.appendChild(out);
  } catch (e) { list.textContent = "Couldn't load your bookings: " + (e.code || e.message); }
}
window.__CR_myBookings = openMyBookings;

/* ============================================================
   OWNER BAR + AUTH
   ============================================================ */
function mountOwnerBar() {
  if (document.getElementById("crOwnerBar")) return;
  const bar = document.createElement("div");
  bar.id = "crOwnerBar";
  bar.innerHTML = `
    <div id="crOwnerTools">
      <span id="crWho">Editing site</span>
      <button id="crSaveBtn">Save</button>
      <button id="crDone">Done</button>
    </div>`;
  document.body.appendChild(bar);
  injectOwnerStyles();
  bar.style.display = "none";                       // nothing floats during normal browsing

  document.getElementById("crSaveBtn").onclick = saveContent;
  document.getElementById("crDone").onclick = () => { window.location.href = "./admin.html"; };

  // Edit mode is entered ONLY via the dashboard's "Edit site" (opens ?edit=1). No public sign-in button.
  const wantEdit = /(?:[?&])edit\b/i.test(location.search);
  onAuthStateChanged(auth, (user) => {
    currentUser = user && OWNERS.includes(user.email) ? user : null;
    if (wantEdit && currentUser) {
      bar.style.display = "block";
      if (!editMode) toggleEdit();
    } else if (wantEdit && !currentUser) {
      window.location.replace("./admin.html");        // must sign in on the dashboard
    } else {
      bar.style.display = "none";
      if (editMode) toggleEdit();
    }
  });
}

function openLogin() {
  const d = drawer("Owner sign in", `
    <label class="crf">Email <input id="loginEmail" type="email" autocomplete="username"></label>
    <label class="crf">Password <input id="loginPw" type="password" autocomplete="current-password"></label>
    <p class="crf" id="loginMsg" style="min-height:1.1em;margin:0 0 6px"></p>
    <button id="loginGo" class="crbtn crbtn-primary">Sign in</button>
    <button id="loginSet" class="crbtn" style="width:100%">First time or forgot? Email me a set-password link</button>
  `);
  const emailEl = d.querySelector("#loginEmail");
  const msg = (t, ok) => { const m = d.querySelector("#loginMsg"); m.textContent = t; m.style.color = ok ? "#7fd47f" : "#f08a8a"; };
  d.querySelector("#loginGo").onclick = () => {
    msg("Signing in…");
    signInWithEmailAndPassword(auth, emailEl.value.trim(), d.querySelector("#loginPw").value)
      .then(() => d.remove())
      .catch(e => msg("Sign in failed (" + e.code + ")."));
  };
  d.querySelector("#loginSet").onclick = () => {
    const em = emailEl.value.trim();
    if (!em) return msg("Enter your email first.");
    sendPasswordResetEmail(auth, em)
      .then(() => msg("Sent — check " + em + " for a link to set your password.", true))
      .catch(e => msg("Couldn't send (" + e.code + ")."));
  };
}

/* ============================================================
   EDIT MODE  (inline WYSIWYG)
   ============================================================ */
function toggleEdit() {
  editMode = !editMode;
  document.body.classList.toggle("cr-editing", editMode);
  document.querySelectorAll("[data-edit],[data-ekey]").forEach(el => {
    el.contentEditable = editMode ? "true" : "false";
    if (editMode) el.addEventListener("input", markDirty); else el.removeEventListener("input", markDirty);
  });
  if (editMode) { enableStructuralControls(); decorateRemovers(); showEditHint(); }
  else { disableStructuralControls(); removeRemovers(); hideEditHint(); }
  document.querySelectorAll("#workGrid figure img, [data-field='hero.photo']").forEach(img => {
    img.style.cursor = editMode ? "pointer" : "";
    img.onclick = editMode ? () => replacePhoto(img) : null;
  });
}

/* ---- remove (×) buttons on repeatable items ---- */
function decorateRemovers() {
  document.querySelectorAll("[data-remove]").forEach(item => {
    if (item.querySelector(":scope > .cr-remove")) return;
    const btn = document.createElement("button");
    btn.className = "cr-remove"; btn.type = "button"; btn.textContent = "×"; btn.title = "Remove";
    btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); removeItem(item.dataset.remove); };
    item.appendChild(btn);
  });
}
function removeRemovers() { document.querySelectorAll(".cr-remove").forEach(b => b.remove()); }
function removeItem(path) {
  const parts = path.split("."); const idx = +parts.pop();
  let arr = content; parts.forEach(k => { arr = arr ? arr[k] : arr; });
  if (Array.isArray(arr) && idx >= 0) arr.splice(idx, 1);
  markDirty();
  if (path.startsWith("packages")) renderPackages();
  else if (path.startsWith("addons")) renderAddons();
  else if (path.startsWith("gallery")) renderGallery();
  else if (path.startsWith("reviews")) renderReviews();
  else if (path.startsWith("area.cities")) renderCities();
  reEnter();
}

/* ---- edit hint banner ---- */
function showEditHint() {
  if (document.getElementById("crEditHint")) return;
  const h = document.createElement("div"); h.id = "crEditHint"; h.className = "cr-edit-hint";
  h.textContent = "Tap any text, price or photo to change it";
  document.body.appendChild(h);
  setTimeout(() => { h.style.transition = "opacity .5s"; h.style.opacity = "0"; setTimeout(() => h.remove(), 600); }, 3500);
}
function hideEditHint() { const h = document.getElementById("crEditHint"); if (h) h.remove(); }

/* ---- make every static text element editable (keyed overrides) ---- */
function tagStaticText() {
  content.textOverrides = content.textOverrides || {};
  const dyn = ["pkgTiers", "pkgCompare", "addonList", "vehSeg", "workGrid", "reviewList", "areaCities", "socialLinks", "crOwnerBar", "crDrawer", "est", "estNote", "priceLive", "sumLines", "bkSummary", "bkDoneNote", "confirmBody", "thumbs", "map", "igFeedMount"];
  const inDyn = (el) => { let n = el; while (n) { if (n.id && dyn.includes(n.id)) return true; n = n.parentElement; } return false; };
  const sel = "h1,h2,h3,h4,p,li,cite,em,.over,.build-label,.est-label,.est-fine,.price-note,.foot-h";
  let n = 0;
  document.querySelectorAll(sel).forEach(el => {
    if (el.hasAttribute("data-field") || el.hasAttribute("data-edit") || el.hasAttribute("data-ekey")) return;
    if (el.closest("[data-field],[data-edit]")) return;
    if (inDyn(el)) return;
    const hasDirectText = [...el.childNodes].some(c => c.nodeType === 3 && c.textContent.trim());
    if (!hasDirectText) return;
    const key = "e" + (n++);
    el.setAttribute("data-ekey", key);
    if (content.textOverrides[key] != null) el.textContent = content.textOverrides[key];
  });
}
function markDirty() { dirty = true; }

function enableStructuralControls() {
  // add/remove buttons for packages, addons, gallery, reviews, cities
  addAdder("#pkgTiers", "Add package", () => { content.packages.push({ id: "p" + Date.now(), name: "New package", price: 100, list: ["Feature"] }); renderPackages(); reEnter(); });
  addAdder("#addonList", "Add add-on", () => { content.addons.push({ id: "a" + Date.now(), label: "New add-on", add: 25 }); renderAddons(); reEnter(); });
  addAdder("#workGrid", "Add photo", () => addPhoto());
  addAdder("#reviewList", "Add review", () => { content.reviews.push({ name: "Customer", text: "Great work!", source: "" }); renderReviews(); reEnter(); });
  addAdder("#areaCities", "Add city", () => { content.area.cities.push("City"); renderCities(); reEnter(); });
}
function reEnter() { // re-apply edit affordances after a re-render
  if (!editMode) return;
  document.querySelectorAll("[data-edit],[data-ekey]").forEach(el => { el.contentEditable = "true"; el.addEventListener("input", markDirty); });
  enableStructuralControls();
  decorateRemovers();
  markDirty();
}
function addAdder(sel, label, fn) {
  const host = document.querySelector(sel);
  if (!host || host.parentNode.querySelector(".cr-adder")) return;
  const b = document.createElement("button");
  b.className = "cr-adder";
  b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg><span></span>`;
  b.querySelector("span").textContent = label;
  b.onclick = fn;
  host.parentNode.insertBefore(b, host.nextSibling);
}
function disableStructuralControls() { document.querySelectorAll(".cr-adder").forEach(b => b.remove()); }

/* ---- photo replace / add with client-side compression → data URL ---- */
function pickImage() {
  return new Promise(resolve => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => resolve(inp.files[0]);
    inp.click();
  });
}
async function compress(file, maxW = 1100, quality = 0.72) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const scale = Math.min(1, maxW / img.width);
  const cv = document.createElement("canvas");
  cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(img.src);
  return cv.toDataURL("image/jpeg", quality);
}
async function replacePhoto(img) {
  const f = await pickImage(); if (!f) return;
  const data = await compress(f);
  img.src = data;
  const fig = img.closest("figure");
  if (fig && fig.dataset.gindex != null) content.gallery[+fig.dataset.gindex].src = data;
  else content.hero.photo = data;
  markDirty();
}
async function addPhoto() {
  const f = await pickImage(); if (!f) return;
  const data = await compress(f);
  content.gallery.push({ src: data, cap: "New photo" });
  renderGallery(); reEnter();
}

/* ---- collect edits back into content, then save ---- */
function collectEdits() {
  document.querySelectorAll("[data-edit]").forEach(el => {
    const path = el.dataset.edit.split(".");
    const val = el.textContent.trim();
    setByPath(content, path, val);
  });
  content.textOverrides = content.textOverrides || {};
  document.querySelectorAll("[data-ekey]").forEach(el => { content.textOverrides[el.dataset.ekey] = el.textContent.trim(); });
  // simple [data-field] text fields (hero, story, etc.) mirror to content too
  const fieldMap = {
    "hero.headline": ["hero", "headline"], "hero.em": ["hero", "em"], "hero.sub": ["hero", "sub"], "hero.mark": ["hero", "mark"],
    "pricingLead": ["pricingLead"], "workHeading": ["workHeading"], "area.lead": ["area", "lead"], "hours": ["hours"],
    "story.over": ["story", "over"], "story.quote": ["story", "quote"], "story.cite": ["story", "cite"], "business.nameSub": ["business", "nameSub"]
  };
  for (const f in fieldMap) {
    const el = document.querySelector(`[data-field="${f}"]`);
    if (el) setByPath(content, fieldMap[f], el.textContent.trim());
  }
}
function setByPath(obj, path, val) {
  let o = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = /^\d+$/.test(path[i]) ? +path[i] : path[i];
    o = o[k];
    if (o == null) return;
  }
  let last = path[path.length - 1];
  if (/^\d+$/.test(last)) last = +last;
  if (typeof o[last] === "number") val = parseFloat(String(val).replace(/[^0-9.]/g, "")) || 0;
  o[last] = val;
}

async function saveContent() {
  if (!currentUser) return alert("Sign in first.");
  collectEdits();
  if (docSizeKB() > 950) return alert("This page is near the 1 MB storage limit (mostly photos). Remove a photo or two before saving, then try again.");
  const btn = document.getElementById("crSaveBtn");
  btn.textContent = "Saving…"; btn.disabled = true;
  try {
    // Preserve fields the admin dashboard owns (availability, booking settings) in case they
    // were changed after this page loaded — the inline editor never edits them, so keep the freshest copy.
    try {
      const fresh = await getDoc(siteRef);
      if (fresh.exists()) {
        const fd = fresh.data();
        if (fd.availability) content.availability = fd.availability;
        if (fd.booking) content.booking = deepMerge(content.booking || {}, fd.booking);
      }
    } catch (e) { /* offline / read blocked — fall through and save what we have */ }
    await setDoc(siteRef, content, { merge: false });
    dirty = false;
    btn.textContent = "Saved";
    setTimeout(() => { btn.textContent = "Save"; btn.disabled = false; }, 1500);
    window.__CR_recomputeQuote && window.__CR_recomputeQuote();
  } catch (e) {
    btn.textContent = "Save"; btn.disabled = false;
    alert("Save failed: " + e.code + "\n" + e.message);
  }
}

window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

/* ============================================================
   SETTINGS DRAWER  +  BOOKINGS  (built next pass — stubs wired)
   ============================================================ */
function docSizeKB() { return Math.round(new Blob([JSON.stringify(content)]).size / 1024); }

function drawer(title, bodyHtml) {
  let d = document.getElementById("crDrawer");
  if (d) d.remove();
  d = document.createElement("div");
  d.id = "crDrawer";
  d.innerHTML = `<div class="crd-scrim"></div><div class="crd-panel"><div class="crd-head"><h3></h3><button class="crd-x" aria-label="Close">&times;</button></div><div class="crd-body"></div></div>`;
  d.querySelector("h3").textContent = title;
  d.querySelector(".crd-body").innerHTML = bodyHtml;   // owner-only content, values set via .value below
  document.body.appendChild(d);
  const close = () => d.remove();
  d.querySelector(".crd-x").onclick = close;
  d.querySelector(".crd-scrim").onclick = close;
  return d;
}

function openSettings() {
  if (!currentUser) return;
  const s = content.social, b = content.booking, sec = content.sections;
  const kb = docSizeKB();
  const pct = Math.min(100, Math.round(kb / 1024 * 100));
  const d = drawer("Settings", `
    <label class="crf">Instagram handle <input id="setIg" placeholder="@yourhandle"></label>
    <label class="crf crf-row"><span>Show Instagram feed on the site</span><input id="setIgFeed" type="checkbox"></label>
    <label class="crf">Facebook URL <input id="setFb"></label>
    <label class="crf">Yelp URL <input id="setYelp"></label>
    <label class="crf">Nextdoor URL <input id="setNd"></label>
    <hr>
    <label class="crf">Hours <input id="setHours"></label>
    <label class="crf">Where booking emails go <input id="setNotify"></label>
    <label class="crf">Accent color <input id="setAccent" type="color"></label>
    <hr>
    <div class="crf"><b>Show / hide sections</b>
      <label class="crf-row"><span>Pricing</span><input data-sec="pricing" type="checkbox"></label>
      <label class="crf-row"><span>Our work</span><input data-sec="work" type="checkbox"></label>
      <label class="crf-row"><span>Story</span><input data-sec="story" type="checkbox"></label>
      <label class="crf-row"><span>Reviews</span><input data-sec="reviews" type="checkbox"></label>
      <label class="crf-row"><span>Service area</span><input data-sec="area" type="checkbox"></label>
      <label class="crf-row"><span>Instagram feed</span><input data-sec="igfeed" type="checkbox"></label>
    </div>
    <hr>
    <div class="crf"><b>Page storage</b><div class="crmeter"><span style="width:${pct}%"></span></div>
      <small>${kb} KB of 1024 KB used (photos live here — keep it under the line).</small></div>
    <hr>
    <div class="crf"><b>Your account</b><br><button id="setPw" class="crbtn">Send me a password reset link</button></div>
    <div class="crf"><b>Connect a domain</b><br><small>Point your domain's DNS to GitHub Pages, then add a CNAME file. Send this to your web person or ask here and we'll do it.</small></div>
    <button id="setSave" class="crbtn crbtn-primary">Save settings</button>
  `);
  // populate values safely (no HTML injection)
  d.querySelector("#setIg").value = s.ig || "";
  d.querySelector("#setIgFeed").checked = !!s.igFeedOn;
  d.querySelector("#setFb").value = s.fb || "";
  d.querySelector("#setYelp").value = s.yelp || "";
  d.querySelector("#setNd").value = s.nextdoor || "";
  d.querySelector("#setHours").value = content.hours || "";
  d.querySelector("#setNotify").value = b.notifyEmail || "";
  d.querySelector("#setAccent").value = content.brand.accent || "#E5362E";
  d.querySelectorAll("[data-sec]").forEach(cb => { cb.checked = !!sec[cb.dataset.sec]; });
  d.querySelector("#setPw").onclick = () => sendPasswordResetEmail(auth, currentUser.email)
    .then(() => alert("Password reset link sent to " + currentUser.email))
    .catch(e => alert("Failed: " + e.code));
  d.querySelector("#setSave").onclick = async () => {
    s.ig = d.querySelector("#setIg").value.trim();
    s.igFeedOn = d.querySelector("#setIgFeed").checked;
    s.fb = d.querySelector("#setFb").value.trim();
    s.yelp = d.querySelector("#setYelp").value.trim();
    s.nextdoor = d.querySelector("#setNd").value.trim();
    content.hours = d.querySelector("#setHours").value.trim();
    b.notifyEmail = d.querySelector("#setNotify").value.trim();
    content.brand.accent = d.querySelector("#setAccent").value;
    d.querySelectorAll("[data-sec]").forEach(cb => { sec[cb.dataset.sec] = cb.checked; });
    try { await saveMeta(); hydrate(); d.remove(); }
    catch (e) { alert("Save failed: " + (e.code || e.message)); }
  };
}

async function fetchBookings() {
  const q = query(collection(db, "sites", SITE_ID, "bookings"), orderBy("created", "desc"));
  const snap = await getDocs(q);
  const out = [];
  snap.forEach(s => out.push({ id: s.id, ...s.data() }));
  return out;
}
function priceNum(estimate) { const m = /\d[\d,]*/.exec(String(estimate || "")); return m ? +m[0].replace(/,/g, "") : 0; }

async function openBookings() {
  if (!currentUser) return;
  const d = drawer("Bookings", `<div id="bkList">Loading…</div>`);
  const list = d.querySelector("#bkList");
  const render = (rows) => {
    list.textContent = "";
    if (!rows.length) { list.textContent = "No bookings yet. They'll appear here the moment someone books."; return; }
    rows.forEach(b => {
      const card = document.createElement("div"); card.className = "bk-card";
      const badge = document.createElement("span"); badge.className = "bk-badge bk-" + (b.status || "new");
      badge.textContent = ({ new: "New", confirmed: "Confirmed", done: "Done" })[b.status || "new"]; card.appendChild(badge);
      const line = (k, v) => { if (!v) return; const p = document.createElement("div"); const a = document.createElement("b"); a.textContent = k + ": "; const s = document.createElement("span"); s.textContent = v; p.append(a, s); card.appendChild(p); };
      line("Name", b.name); line("Phone", b.phone); line("Email", b.email); line("Package", b.package);
      line("Vehicle", b.vehicle); line("Estimate", b.estimate); line("Add-ons", b.addons);
      line("Date", b.date); line("Time", b.time); line("Where", b.address);
      const acts = document.createElement("div"); acts.className = "bk-acts";
      const btn = (label, fn, cls) => { const x = document.createElement("button"); x.className = "crbtn" + (cls ? " " + cls : ""); x.textContent = label; x.onclick = fn; acts.appendChild(x); };
      if ((b.status || "new") === "new") btn("Confirm", async () => { await updateDoc(doc(db, "sites", SITE_ID, "bookings", b.id), { status: "confirmed" }); b.status = "confirmed"; render(rows); });
      if ((b.status || "new") !== "done") btn("Mark done", async () => { await updateDoc(doc(db, "sites", SITE_ID, "bookings", b.id), { status: "done" }); b.status = "done"; render(rows); });
      btn("Delete", async () => { if (!confirm("Delete this booking?")) return; await deleteDoc(doc(db, "sites", SITE_ID, "bookings", b.id)); render(rows.filter(r => r.id !== b.id)); }, "crbtn-danger");
      card.appendChild(acts);
      list.appendChild(card);
    });
  };
  try { render(await fetchBookings()); }
  catch (e) { list.textContent = "Could not load bookings: " + (e.code || e.message); }
}

/* ---- CUSTOMERS CRM: group bookings by phone → history, repeats, total, follow-up ---- */
async function openCustomers() {
  if (!currentUser) return;
  const d = drawer("Customers", `<div id="custWrap">Loading…</div>`);
  const wrap = d.querySelector("#custWrap");
  let rows;
  try { rows = await fetchBookings(); } catch (e) { wrap.textContent = "Could not load: " + (e.code || e.message); return; }
  // group by phone (fallback name)
  const map = {};
  rows.forEach(b => {
    const key = (b.phone || b.name || "").replace(/\D/g, "") || b.name || "unknown";
    (map[key] = map[key] || { name: b.name, phone: b.phone, email: b.email, visits: [], total: 0 }).visits.push(b);
  });
  const custs = Object.values(map).map(c => {
    c.total = c.visits.reduce((s, v) => s + priceNum(v.estimate), 0);
    c.email = c.email || c.visits.map(v => v.email).find(Boolean) || "";
    c.count = c.visits.length;
    return c;
  }).sort((a, b) => b.count - a.count);
  const withEmail = custs.filter(c => c.email).length;

  wrap.textContent = "";
  const sum = document.createElement("div"); sum.className = "cust-sum";
  sum.textContent = `${custs.length} customers · ${custs.filter(c => c.count > 1).length} repeat · ${withEmail} with email`;
  wrap.appendChild(sum);
  const promoBtn = document.createElement("button"); promoBtn.className = "crbtn crbtn-primary"; promoBtn.style.width = "100%"; promoBtn.textContent = "Send a promo →";
  promoBtn.onclick = () => openPromo(custs);
  wrap.appendChild(promoBtn);

  custs.forEach(c => {
    const card = document.createElement("div"); card.className = "cust-card";
    const h = document.createElement("div"); h.className = "cust-head";
    const nm = document.createElement("b"); nm.textContent = c.name || "(no name)";
    const tag = document.createElement("span"); tag.className = "cust-tag" + (c.count > 1 ? " repeat" : "");
    tag.textContent = c.count > 1 ? c.count + "× repeat" : "new"; h.append(nm, tag); card.appendChild(h);
    const meta = document.createElement("div"); meta.className = "cust-meta";
    meta.textContent = [c.phone, c.email, "~$" + c.total.toLocaleString() + " total", "last: " + (c.visits[0].date || "—")].filter(Boolean).join(" · ");
    card.appendChild(meta);
    wrap.appendChild(card);
  });
}

function openPromo(custs) {
  const emails = custs.map(c => c.email).filter(Boolean);
  const phones = custs.map(c => c.phone).filter(Boolean);
  const ej = content?.booking?.emailjs;
  const d = drawer("Send a promo", `
    <div class="crf">Audience: <b>${custs.length}</b> customers — <b>${emails.length}</b> have email, <b>${phones.length}</b> have a phone.</div>
    <label class="crf">Subject <input id="promoSubj" placeholder="20% off your next detail"></label>
    <label class="crf">Message <textarea id="promoMsg" rows="5" style="width:100%;background:#0f1114;border:1px solid #2b323b;border-radius:6px;color:#fff;padding:9px"></textarea></label>
    <p class="crf" id="promoMode"></p>
    <button id="promoSend" class="crbtn crbtn-primary" style="width:100%">Send email promo (${emails.length})</button>
    <button id="promoSms" class="crbtn" style="width:100%">Copy phone list for texting (${phones.length})</button>
    <p class="crf" id="promoOut" style="min-height:1.1em"></p>
  `);
  const out = (t, ok) => { const o = d.querySelector("#promoOut"); o.textContent = t; o.style.color = ok ? "#7fd47f" : "#f0a"; };
  if (!(ej && ej.serviceId && ej.templateId && ej.publicKey)) {
    d.querySelector("#promoMode").textContent = "Email sending needs a free EmailJS key in Settings first. You can still copy the phone list to text.";
    d.querySelector("#promoSend").disabled = true;
  }
  d.querySelector("#promoSms").onclick = () => {
    navigator.clipboard.writeText(phones.join(", ")).then(() => out("Phone list copied — paste into your texting app.", true)).catch(() => out("Copy failed."));
  };
  d.querySelector("#promoSend").onclick = async () => {
    const subj = d.querySelector("#promoSubj").value.trim(), msg = d.querySelector("#promoMsg").value.trim();
    if (!subj || !msg) return out("Add a subject and message.");
    out("Sending…"); let sent = 0;
    for (const c of custs.filter(x => x.email)) {
      try { await window.emailjs.send(ej.serviceId, ej.templateId, { to_email: c.email, to_name: c.name || "", subject: subj, message: msg }, { publicKey: ej.publicKey }); sent++; }
      catch (e) { /* continue */ }
    }
    out(`Sent to ${sent} of ${emails.length}.`, true);
  };
}

async function saveMeta() { await setDoc(siteRef, content, { merge: false }); }
window.__CR_content = () => content;
window.__CR_seed = async () => { if (!currentUser) return "sign in first"; content = structuredClone(DEFAULT_CONTENT); await setDoc(siteRef, content, { merge: false }); hydrate(); return "seeded"; };

/* ---- owner bar styles ---- */
function injectOwnerStyles() {
  const s = document.createElement("style");
  s.textContent = `
  #crOwnerBar{position:fixed;left:16px;bottom:16px;z-index:9999;font-family:system-ui,sans-serif}
  #crOwnerBar button{background:#111;color:#fff;border:1px solid #333;border-radius:6px;padding:8px 12px;font-size:13px;cursor:pointer;margin-right:6px}
  #crOwnerBar button:hover{background:#222}
  #crOwnerTools{display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:rgba(10,10,12,.92);padding:8px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5);max-width:calc(100vw - 32px)}
  #crOwnerTools[hidden]{display:none}
  #crWho{color:#9aa;font-size:12px;margin-right:4px}
  #crSaveBtn{background:var(--accent,#E5362E)!important;border-color:var(--accent,#E5362E)!important}
  html,body{overflow-x:hidden;max-width:100%}
  body.cr-editing [data-edit],body.cr-editing [data-ekey]{outline:1px dashed rgba(46,134,242,.7);outline-offset:2px;cursor:text;min-height:1em}
  body.cr-editing [data-edit]:focus,body.cr-editing [data-ekey]:focus{outline:2px solid #2E86F2;background:rgba(46,134,242,.08)}
  body.cr-editing .mobile-bar{display:none}
  .cr-remove{position:absolute;top:-8px;right:-8px;z-index:5;width:22px;height:22px;border-radius:50%;background:#E5362E;color:#fff;border:2px solid #0c0d10;font:700 13px/1 system-ui;cursor:pointer;display:flex;align-items:center;justify-content:center}
  body.cr-editing .cr-removable{position:relative}
  .cr-edit-hint{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9998;background:#2E86F2;color:#fff;padding:8px 16px;border-radius:20px;font:600 13px system-ui;box-shadow:0 6px 20px rgba(0,0,0,.4)}
  body.cr-editing a:not([data-edit]):not([data-ekey]):not(.cr-remove):not(.cr-adder),body.cr-editing button:not(.cr-remove):not(.cr-adder):not(#crSaveBtn):not(#crDone){pointer-events:none}
  body.cr-editing [data-edit],body.cr-editing [data-ekey],body.cr-editing #workGrid img,body.cr-editing [data-field="hero.photo"],body.cr-editing .cr-remove,body.cr-editing .cr-adder{pointer-events:auto}
  .cr-adder{display:inline-flex;align-items:center;gap:6px;margin:10px auto;background:#123;color:#8cf;border:1px dashed #2E86F2;border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer}
  .cr-adder svg{flex:none}
  #crDrawer{position:fixed;inset:0;z-index:10000;font-family:system-ui,sans-serif}
  #crDrawer .crd-scrim{position:absolute;inset:0;background:rgba(0,0,0,.55)}
  #crDrawer .crd-panel{position:absolute;top:0;right:0;height:100%;width:min(420px,92vw);background:#14161a;color:#e8eef4;box-shadow:-10px 0 40px rgba(0,0,0,.5);display:flex;flex-direction:column}
  #crDrawer .crd-head{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid #262b33}
  #crDrawer .crd-head h3{margin:0;font-size:1.05rem}
  #crDrawer .crd-x{background:none;border:0;color:#9aa;font-size:26px;cursor:pointer;line-height:1}
  #crDrawer .crd-body{padding:18px;overflow:auto}
  #crDrawer hr{border:0;border-top:1px solid #262b33;margin:16px 0}
  .crf{display:block;margin:0 0 12px;font-size:.85rem;color:#aeb8c4}
  .crf input:not([type=checkbox]):not([type=color]){display:block;width:100%;margin-top:5px;padding:9px 10px;background:#0f1114;border:1px solid #2b323b;border-radius:6px;color:#fff;font-size:.9rem}
  .crf-row{display:flex;justify-content:space-between;align-items:center;margin:7px 0}
  .crmeter{height:8px;background:#0f1114;border:1px solid #2b323b;border-radius:5px;overflow:hidden;margin:6px 0}
  .crmeter span{display:block;height:100%;background:linear-gradient(90deg,#2E86F2,#E5362E)}
  .crbtn{background:#222833;color:#dce4ee;border:1px solid #333c48;border-radius:6px;padding:9px 14px;font-size:.85rem;cursor:pointer;margin-top:8px}
  .crbtn-primary{background:var(--accent,#E5362E);border-color:var(--accent,#E5362E);color:#fff;width:100%;margin-top:16px;padding:12px}
  .bk-card{background:#0f1114;border:1px solid #262b33;border-radius:8px;padding:12px 14px;margin-bottom:10px;font-size:.85rem;position:relative}
  .bk-card b{color:#8fa1b5;font-weight:600}
  .bk-badge{position:absolute;top:12px;right:12px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:2px 8px;border-radius:20px}
  .bk-new{background:#3a2f12;color:#f5c451}.bk-confirmed{background:#12331f;color:#7fd47f}.bk-done{background:#22262c;color:#8fa1b5}
  .bk-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
  .bk-acts .crbtn{margin-top:0;padding:6px 10px;font-size:.78rem}
  .crbtn-danger{background:#3a1618;border-color:#5a2327;color:#f0a}
  .cust-sum{color:#aeb8c4;font-size:.82rem;margin-bottom:10px}
  .cust-card{background:#0f1114;border:1px solid #262b33;border-radius:8px;padding:11px 13px;margin:10px 0 0;font-size:.85rem}
  .cust-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .cust-head b{font-size:.95rem}
  .cust-tag{font-size:.68rem;text-transform:uppercase;letter-spacing:.04em;padding:2px 8px;border-radius:20px;background:#22262c;color:#8fa1b5;white-space:nowrap}
  .cust-tag.repeat{background:#12331f;color:#7fd47f}
  .cust-meta{color:#8fa1b5;font-size:.78rem;margin-top:5px;word-break:break-word}
  .trk-row{display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-bottom:1px solid #232830;font-size:.9rem}
  .trk-row b{color:#8fa1b5;font-weight:600}.trk-row span{text-align:right}
  .trk-status{margin:2px 0 14px;padding:10px 12px;border-radius:8px;font-weight:600;text-align:center}
  .trk-new{background:#3a2f12;color:#f5c451}.trk-confirmed{background:#12331f;color:#7fd47f}.trk-done{background:#22262c;color:#8fa1b5}
  `;
  document.head.appendChild(s);
}

/* go */
load();
