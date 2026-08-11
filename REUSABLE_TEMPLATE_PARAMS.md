# Detailer/SMB Site — Reusable Template Parameters
**What to parameterize so the next client site is a ~30-minute build, not a rebuild.**

The site is already split into an **engine** (never changes) and **client data** (all that changes). The goal: shrink "what changes per client" to a single config block + photos + a Firebase project.

## 1. The engine (reuse verbatim — do NOT touch per client)
- `app.js` — hydrate, inline editor, auth, bookings, CRM, promos, track-link
- `styles.css` — the flagship design system (Archivo/Hanken/JetBrains, accent var)
- `index.html` — structure + data-field/data-edit hooks + quote/booking/map inline JS
These are niche-agnostic. A new client should never edit them.

## 2. The per-client config (the ONLY things that change) — extract to ONE block
Today these are scattered (top of app.js + firebase-config.js). **Consolidate into one `CLIENT` object:**
```js
const CLIENT = {
  siteId: "colorado-reflections",
  owners: ["corefmobiledetail@gmail.com","carsonhanna5@gmail.com"],
  firebase: { /* web config */ },
  accent: "#E5362E",
  map: { center:[39.878,-104.985], radius:17000,
         cities:[["Thornton",39.868,-104.972], ...] },
  phoneRaw: "+13035898214"
};
```
Everything else (copy, packages, prices, photos, story, hours, social) is already the **`DEFAULT_CONTENT`** object → that becomes `content.js` per client.

## 3. Niche = a "pack" (detailer / landscaper / pressure-wash / groomer)
The quote model is data, not code. A niche pack = `{ packages, vehicles, addons, included, sectionLabels }`.
- Detailer: packages + vehicle-size surcharge + add-ons (built).
- Landscaper: swap "vehicle size" → "yard size"; different packages/add-ons.
- Same engine renders any pack. Build the pack once per niche, reuse across all clients in that niche.

## 4. Firebase provisioning — identical every time, so automate it
Per client today = ~15 console clicks (project, email/pw auth, firestore, rules, owner users, authorized domain, web app). Make it repeatable:
- **Rules should be client-agnostic.** Instead of hardcoding owner emails, gate writes on a **custom auth claim** (`request.auth.token.owner == true`) or an `owners/{uid}` doc. Then the SAME rules deploy to every project — never edited.
- Commit `firebase.json` + `firestore.rules` so `firebase deploy` handles rules + hosting once the CLI is authed (installing firebase-tools removes the console clicking).
- A one-page **provision checklist** (or script): create project → enable auth/firestore → add owners → deploy rules → add domain.

## 5. Seed automation
Auto-seed the content doc on first load if it doesn't exist (guarded to owners), OR a `seed.js` that writes `DEFAULT_CONTENT` → no manual "save once" step.

## 6. Photo pipeline (repeatable)
Pull from Yelp/Nextdoor CDN → name `hero.jpg` + `gal-1..6.jpg`. Owner replaces later via the admin (compressed → stored in the content doc).

## 7. Known upgrades to bake into the template next time
- **Photos in a subcollection** (not the 1 MB content doc) so galleries can grow unbounded.
- **EmailJS keys** as a client config field (booking email + promos) — set up once per client.
- **Custom-claim auth** so rules are universal (see #4).
- **Track-link + CRM + promos** — already generic, keep.

## Net: a new client build =
1. New Firebase project (5 min, automatable)
2. Fill `CLIENT` block + `content.js` + drop in photos (15 min)
3. Deploy + seed + connect domain (10 min)
Engine untouched. That's the whole job.
