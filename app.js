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
  sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs,
  query, orderBy, serverTimestamp
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
    sub: "Interior and exterior detailing for cars, trucks, boats and RVs — done at your home or office across Denver's north metro.",
    mark: "Mobile detailing  ·  20+ years  ·  We come to you across the north metro",
    photo: "./images/hero.jpg"
  },
  brand: { accent: "#E5362E" },
  pricingLead: "Pick a package, add your vehicle and any extras, and your price updates as you go — no waiting on a callback. James confirms the final number after a couple of quick photos.",
  packages: [
    { id: "basic", name: "Basic Interior", price: 60, desc: "", list: ["Full interior vacuum & wipe-down", "Windows, dash & console cleaned", "Door jambs & trash-out", "Light deodorize"] },
    { id: "gold", name: "Full Detail", price: 160, featured: true, tag: "Most chosen", list: ["Full interior clean & shampoo", "Exterior hand wash", "Clay bar & leather care", "Hand wax & wheels dressed"] },
    { id: "platinum", name: "Buff & Ceramic", price: 290, desc: "", list: ["Everything in Full Detail", "Paint correction buff", "Engine bay cleaning", "Ceramic coating & showroom finish"] }
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
    { id: "bugsap", label: "Bug & sap removal", add: 35 },
    { id: "engine", label: "Engine bay cleaning", add: 50 }
  ],
  included: { basic: [], gold: [], platinum: ["engine"] },
  workHeading: "Real vehicles, real driveways.",
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
    cite: "James · Owner, Colorado Reflections · detailing since 1998"
  },
  reviews: [
    { name: "A Lakewood neighbor", text: "James @ Colorado Reflections — highly recommend.", source: "Nextdoor recommendation" }
  ],
  area: {
    lead: "Fully mobile across Denver's north metro — your driveway, your office lot, wherever the vehicle sits. Cars, boats, RVs and motorcycles, seven days a week. Just outside the ring? Call us, we often still make it work.",
    cities: ["Thornton", "Northglenn", "Westminster", "Broomfield", "Arvada", "Denver"]
  },
  hours: "Mon–Fri 9:00a–7:30p · Sat 10:00a–7:30p · Sun 11:00a–7:30p · By appointment.",
  social: { ig: "", fb: "", yelp: "https://www.yelp.com/biz/colorado-reflections-mobile-detail-denver", nextdoor: "", igFeedOn: false },
  booking: { notifyEmail: "corefmobiledetail@gmail.com", photoUploadOn: true, emailjs: { serviceId: "", templateId: "", publicKey: "" } },
  sections: { pricing: true, work: true, story: true, reviews: true, area: true, igfeed: false },
  seo: {
    title: "Colorado Reflections Mobile Detail — Detailing Brought to Your Driveway in Denver's North Metro",
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
  renderGallery();
  renderStory();
  renderReviews();
  renderCities();
  applySectionVisibility();
  renderSocial();
  window.__CR_recomputeQuote && window.__CR_recomputeQuote();
}

/* ---- renderers (also used to re-render after edits) ---- */
function renderPackages() {
  const wrap = document.querySelector("#pkgTiers");
  const strip = document.querySelector("#pkgCompare");
  if (wrap) {
    wrap.innerHTML = content.packages.map(p => `
      <label class="tier${p.featured ? " tier-feature" : ""}" data-pkg="${p.id}">
        <input type="radio" name="pkg" value="${p.id}" data-base="${p.price}" />
        ${p.tag ? `<span class="tier-tag">${esc(p.tag)}</span>` : ""}
        <span class="tier-head">
          <span class="tier-name" data-edit="pkg.${p.id}.name">${esc(p.name)}</span>
          <span class="tier-price">from <b>$<span data-edit="pkg.${p.id}.price">${p.price}</span></b></span>
        </span>
        <span class="tier-list">${p.list.map((li, i) => `<span data-edit="pkg.${p.id}.list.${i}">${esc(li)}</span>`).join("")}</span>
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
function renderAddons() {
  const ex = document.querySelector("#addonList");
  if (!ex) return;
  ex.innerHTML = content.addons.map(a => `
    <label class="ex"><input type="checkbox" name="ex" data-key="${a.id}" data-add="${a.add}" />
      <span><span data-edit="addon.${a.id}.label">${esc(a.label)}</span> <b data-price="+$${a.add}">+$${a.add}</b></span></label>`).join("");
}
function renderGallery() {
  const g = document.querySelector("#workGrid");
  if (!g) return;
  g.innerHTML = content.gallery.map((ph, i) => `
    <figure data-gindex="${i}"><img src="${ph.src}" alt="${esc(ph.cap || "")}" />
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
    <blockquote class="rev-card"><p data-edit="review.${i}.text">${esc(rv.text)}</p>
      <footer>— <span data-edit="review.${i}.name">${esc(rv.name)}</span>${rv.source ? ` · ${esc(rv.source)}` : ""}</footer></blockquote>`).join("");
}
function renderCities() {
  const ul = document.querySelector("#areaCities");
  if (!ul) return;
  ul.innerHTML = content.area.cities.map((c, i) => `<li data-edit="area.cities.${i}">${esc(c)}</li>`).join("");
}
function renderSocial() {
  const box = document.querySelector("#socialLinks");
  if (box) {
    const s = content.social, links = [];
    if (s.ig) links.push(`<a href="https://instagram.com/${s.ig.replace(/^@/, "")}" target="_blank" rel="noopener">Instagram</a>`);
    if (s.fb) links.push(`<a href="${s.fb}" target="_blank" rel="noopener">Facebook</a>`);
    if (s.yelp) links.push(`<a href="${s.yelp}" target="_blank" rel="noopener">Yelp</a>`);
    if (s.nextdoor) links.push(`<a href="${s.nextdoor}" target="_blank" rel="noopener">Nextdoor</a>`);
    box.innerHTML = links.join("");
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
  const record = { ...payload, site: SITE_ID, created: serverTimestamp() };
  try {
    await addDoc(collection(db, "sites", SITE_ID, "bookings"), record);
  } catch (e) { console.warn("Booking save failed:", e); }
  // optional email via EmailJS if configured
  const ej = content?.booking?.emailjs;
  if (ej && ej.serviceId && ej.templateId && ej.publicKey && window.emailjs) {
    try {
      await window.emailjs.send(ej.serviceId, ej.templateId,
        { to_email: content.booking.notifyEmail, ...payload }, { publicKey: ej.publicKey });
    } catch (e) { console.warn("EmailJS failed:", e); }
  }
}
window.__CR_submitBooking = submitBooking;

/* ============================================================
   OWNER BAR + AUTH
   ============================================================ */
function mountOwnerBar() {
  if (document.getElementById("crOwnerBar")) return;
  const bar = document.createElement("div");
  bar.id = "crOwnerBar";
  bar.innerHTML = `
    <button id="crLoginBtn" title="Owner sign in">Owner</button>
    <div id="crOwnerTools" hidden>
      <span id="crWho"></span>
      <button id="crEditToggle">Edit site</button>
      <button id="crSettingsBtn">Settings</button>
      <button id="crSaveBtn" hidden>Save</button>
      <button id="crBookingsBtn">Bookings</button>
      <button id="crLogout">Sign out</button>
    </div>`;
  document.body.appendChild(bar);
  injectOwnerStyles();

  document.getElementById("crLoginBtn").onclick = openLogin;
  document.getElementById("crEditToggle").onclick = toggleEdit;
  document.getElementById("crSaveBtn").onclick = saveContent;
  document.getElementById("crSettingsBtn").onclick = openSettings;
  document.getElementById("crBookingsBtn").onclick = openBookings;
  document.getElementById("crLogout").onclick = () => signOut(auth);

  onAuthStateChanged(auth, (user) => {
    currentUser = user && OWNERS.includes(user.email) ? user : null;
    const tools = document.getElementById("crOwnerTools");
    const loginBtn = document.getElementById("crLoginBtn");
    if (currentUser) {
      tools.hidden = false; loginBtn.hidden = true;
      document.getElementById("crWho").textContent = currentUser.email.split("@")[0];
    } else {
      tools.hidden = true; loginBtn.hidden = false;
      if (editMode) toggleEdit();
    }
  });
}

function openLogin() {
  const email = prompt("Owner email:");
  if (!email) return;
  const pw = prompt("Password:\n\n(First time? Leave this blank and press OK to get a 'set your password' email.)");
  if (pw) {
    signInWithEmailAndPassword(auth, email.trim(), pw)
      .catch(err => alert("Sign in failed: " + err.code + "\n\nIf this is your first time, leave the password blank to set one."));
  } else {
    sendPasswordResetEmail(auth, email.trim())
      .then(() => alert("Check " + email + " — we sent a link to set your password. Set it, then sign in again."))
      .catch(err => alert("Could not send reset email: " + err.code));
  }
}

/* ============================================================
   EDIT MODE  (inline WYSIWYG)
   ============================================================ */
function toggleEdit() {
  editMode = !editMode;
  document.body.classList.toggle("cr-editing", editMode);
  document.getElementById("crEditToggle").textContent = editMode ? "Editing…" : "Edit site";
  document.getElementById("crSaveBtn").hidden = !editMode;
  document.querySelectorAll("[data-edit]").forEach(el => {
    el.contentEditable = editMode ? "true" : "false";
    if (editMode) el.addEventListener("input", markDirty); else el.removeEventListener("input", markDirty);
  });
  if (editMode) enableStructuralControls(); else disableStructuralControls();
  // photos become clickable to replace
  document.querySelectorAll("#workGrid figure img, [data-field='hero.photo']").forEach(img => {
    img.style.cursor = editMode ? "pointer" : "";
    img.onclick = editMode ? () => replacePhoto(img) : null;
  });
}
function markDirty() { dirty = true; }

function enableStructuralControls() {
  // add/remove buttons for packages, addons, gallery, reviews, cities
  addAdder("#pkgTiers", "＋ package", () => { content.packages.push({ id: "p" + Date.now(), name: "New package", price: 100, list: ["Feature"] }); renderPackages(); reEnter(); });
  addAdder("#addonList", "＋ add-on", () => { content.addons.push({ id: "a" + Date.now(), label: "New add-on", add: 25 }); renderAddons(); reEnter(); });
  addAdder("#workGrid", "＋ photo", () => addPhoto());
  addAdder("#reviewList", "＋ review", () => { content.reviews.push({ name: "Customer", text: "Great work!", source: "" }); renderReviews(); reEnter(); });
  addAdder("#areaCities", "＋ city", () => { content.area.cities.push("City"); renderCities(); reEnter(); });
}
function reEnter() { // re-apply edit affordances after a re-render
  if (!editMode) return;
  document.querySelectorAll("[data-edit]").forEach(el => { el.contentEditable = "true"; el.addEventListener("input", markDirty); });
  enableStructuralControls();
  markDirty();
}
function addAdder(sel, label, fn) {
  const host = document.querySelector(sel);
  if (!host || host.parentNode.querySelector(".cr-adder")) return;
  const b = document.createElement("button");
  b.className = "cr-adder"; b.textContent = label; b.onclick = fn;
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
async function compress(file, maxW = 1400, quality = 0.82) {
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
  const btn = document.getElementById("crSaveBtn");
  btn.textContent = "Saving…"; btn.disabled = true;
  try {
    await setDoc(siteRef, content, { merge: false });
    dirty = false;
    btn.textContent = "Saved ✓";
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
function openSettings() { window.__CR_openSettings ? window.__CR_openSettings(content, saveMeta) : alert("Settings drawer loads with settings.js"); }
function openBookings() { window.__CR_openBookings ? window.__CR_openBookings(db, SITE_ID) : alert("Bookings view loads with settings.js"); }
async function saveMeta() { await setDoc(siteRef, content, { merge: false }); }
window.__CR_content = () => content;
window.__CR_auth = { auth, sendPasswordResetEmail, OWNERS };

/* ---- owner bar styles ---- */
function injectOwnerStyles() {
  const s = document.createElement("style");
  s.textContent = `
  #crOwnerBar{position:fixed;left:16px;bottom:16px;z-index:9999;font-family:system-ui,sans-serif}
  #crOwnerBar button{background:#111;color:#fff;border:1px solid #333;border-radius:6px;padding:8px 12px;font-size:13px;cursor:pointer;margin-right:6px}
  #crOwnerBar button:hover{background:#222}
  #crOwnerTools{display:flex;align-items:center;gap:6px;background:rgba(10,10,12,.92);padding:8px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5)}
  #crWho{color:#9aa;font-size:12px;margin-right:4px}
  #crSaveBtn{background:var(--accent,#E5362E)!important;border-color:var(--accent,#E5362E)!important}
  body.cr-editing [data-edit]{outline:1px dashed rgba(46,134,242,.7);outline-offset:2px;cursor:text;min-width:12px;display:inline-block}
  body.cr-editing [data-edit]:focus{outline:2px solid #2E86F2;background:rgba(46,134,242,.08)}
  .cr-adder{display:inline-block;margin:10px auto;background:#123;color:#8cf;border:1px dashed #2E86F2;border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer}
  `;
  document.head.appendChild(s);
}

/* go */
load();
