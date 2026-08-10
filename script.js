/* ============================================================
   COLORADO REFLECTIONS MOBILE DETAIL — interactions
   Auto · Boat · RV · Motorcycle · Denver north metro · We come to you
   ------------------------------------------------------------
   EDIT PRICES & PACKAGES HERE: the PRICES / PKG_LABEL / ADDON_LABEL
   objects below drive the whole quote tool. Change a number, save.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- footer year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- mobile menu ---------- */
  var hamburger = document.getElementById("hamburger");
  var mobileMenu = document.getElementById("mobileMenu");
  if (hamburger && mobileMenu) {
    hamburger.addEventListener("click", function () {
      var open = mobileMenu.hasAttribute("hidden");
      if (open) {
        mobileMenu.removeAttribute("hidden");
        hamburger.setAttribute("aria-expanded", "true");
      } else {
        mobileMenu.setAttribute("hidden", "");
        hamburger.setAttribute("aria-expanded", "false");
      }
    });
    mobileMenu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        mobileMenu.setAttribute("hidden", "");
        hamburger.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ============================================================
     QUOTE TOOL
     -----------------------------------------------------------
     >>> JAMES: these are the prices customers see. Placeholders to
     start — set them to your real numbers and they update everywhere.
     ============================================================ */
  var PRICES = {
    express:  { sedan: 89,  suv: 109, truck: 119, oversized: 139 },
    full:     { sedan: 229, suv: 259, truck: 279, oversized: 309 },
    ceramic:  { sedan: 749, suv: 799, truck: 829, oversized: 879 }
  };
  var PKG_LABEL = { express: "Express Wash", full: "Full Detail", ceramic: "Buff & Ceramic" };
  var VEH_LABEL = {
    sedan: "Sedan / Coupe", suv: "SUV / Crossover",
    truck: "Truck", oversized: "Oversized / Van"
  };
  var ADDON_LABEL = {
    pethair: "Pet hair removal",
    stains: "Shampoo & stain extraction",
    bugsap: "Bug & sap removal",
    engine: "Engine bay cleaning",
    headlight: "Headlight restoration",
    decal: "Decal / sticker removal"
  };

  // add-ons a package already covers -> shown checked + "Included" ($0); all others are optional surcharges.
  var INCLUDED = { express: [], full: ["engine"], ceramic: ["bugsap"] };

  var form = document.getElementById("quoteForm");
  if (!form) return;

  var priceLive = document.getElementById("priceLive");
  var sumLines = document.getElementById("sumLines");
  var photoInput = document.getElementById("photoInput");
  var thumbs = document.getElementById("thumbs");
  var formError = document.getElementById("formError");
  var confirmBox = document.getElementById("confirm");
  var confirmBody = document.getElementById("confirmBody");

  var selectedFiles = []; // {file, url}

  function getPackage() {
    var el = form.querySelector('input[name="package"]:checked');
    return el ? el.value : null;
  }
  function getVehicle() {
    var el = form.querySelector('input[name="vehicle"]:checked');
    return el ? el.value : null;
  }
  function getAddons() {
    return Array.prototype.slice
      .call(form.querySelectorAll('input[name="addon"]:checked'))
      .map(function (el) {
        var included = el.disabled;
        return { value: el.value, price: included ? 0 : parseInt(el.dataset.price, 10), included: included };
      });
  }

  function applyIncluded() {
    var pkg = getPackage();
    var inc = (pkg && INCLUDED[pkg]) ? INCLUDED[pkg] : [];
    Array.prototype.slice.call(form.querySelectorAll('input[name="addon"]')).forEach(function (el) {
      var chip = el.closest(".chip");
      var priceEl = chip ? chip.querySelector(".chip-price") : null;
      if (inc.indexOf(el.value) !== -1) {
        el.checked = true; el.disabled = true;
        if (chip) chip.classList.add("chip-included");
        if (priceEl) priceEl.textContent = "Included";
      } else {
        el.disabled = false;
        if (chip) chip.classList.remove("chip-included");
        if (priceEl) priceEl.textContent = "+" + money(parseInt(el.dataset.price, 10));
      }
    });
  }

  function money(n) { return "$" + n.toLocaleString("en-US"); }

  function computeBase() {
    var pkg = getPackage(), veh = getVehicle();
    if (pkg && veh && PRICES[pkg] && PRICES[pkg][veh] != null) return PRICES[pkg][veh];
    return null;
  }

  function bumpPrice() {
    priceLive.classList.remove("bump");
    void priceLive.offsetWidth;
    priceLive.classList.add("bump");
  }

  function render() {
    applyIncluded();
    var pkg = getPackage();
    var veh = getVehicle();
    var addons = getAddons();
    var base = computeBase();

    var html = "";
    if (!pkg && !veh) {
      html = '<li class="sum-empty">Pick a package and vehicle to see your price.</li>';
      priceLive.innerHTML = "$&mdash;";
      sumLines.innerHTML = html;
      return;
    }

    if (pkg) {
      html += '<li><span>' + PKG_LABEL[pkg] + '</span><span>' +
        (base != null ? money(base) : "pick vehicle") + "</span></li>";
    }
    if (veh) {
      html += '<li><span>' + VEH_LABEL[veh] + '</span><span>' +
        (pkg ? "included" : "pick package") + "</span></li>";
    }

    var addonTotal = 0;
    if (addons.length) {
      html += '<li class="sum-head"><span>Add-ons</span><span></span></li>';
      addons.forEach(function (a) {
        addonTotal += a.price;
        html += '<li><span>' + ADDON_LABEL[a.value] + '</span><span>' +
          (a.included ? "Included" : "+" + money(a.price)) + "</span></li>";
      });
    }

    var total = (base || 0) + addonTotal;

    if (base != null) {
      html += '<li class="sum-total"><span>Estimate</span><span>' + money(total) + "</span></li>";
      priceLive.textContent = money(total);
      bumpPrice();
    } else {
      priceLive.innerHTML = "$&mdash;";
    }

    sumLines.innerHTML = html;
  }

  form.addEventListener("change", function (e) {
    if (e.target.name === "package" || e.target.name === "vehicle" || e.target.name === "addon") {
      render();
    }
  });

  /* ---------- photo previews ---------- */
  if (photoInput) {
    photoInput.addEventListener("change", function () {
      Array.prototype.slice.call(photoInput.files).forEach(function (file) {
        if (!file.type.indexOf || file.type.indexOf("image/") !== 0) return;
        var url = URL.createObjectURL(file);
        selectedFiles.push({ file: file, url: url });
      });
      renderThumbs();
    });
  }

  function renderThumbs() {
    thumbs.innerHTML = "";
    selectedFiles.forEach(function (item, idx) {
      var wrap = document.createElement("div");
      wrap.className = "thumb";
      var img = document.createElement("img");
      img.src = item.url;
      img.alt = "Selected photo " + (idx + 1);
      wrap.appendChild(img);
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "thumb-rm";
      rm.setAttribute("aria-label", "Remove photo " + (idx + 1));
      rm.innerHTML = "&times;";
      rm.addEventListener("click", function () {
        URL.revokeObjectURL(item.url);
        selectedFiles.splice(idx, 1);
        renderThumbs();
      });
      wrap.appendChild(rm);
      thumbs.appendChild(wrap);
    });
  }

  /* ---------- date min = today ---------- */
  var dateInput = document.getElementById("dateInput");
  if (dateInput) {
    var t = new Date();
    var iso = t.getFullYear() + "-" +
      String(t.getMonth() + 1).padStart(2, "0") + "-" +
      String(t.getDate()).padStart(2, "0");
    dateInput.min = iso;
  }

  /* ---------- submit ---------- */
  form.addEventListener("submit", submitQuote);

  function submitQuote(e) {
    e.preventDefault();

    var pkg = getPackage();
    var veh = getVehicle();
    var addons = getAddons();
    var base = computeBase();
    var name = (document.getElementById("nameInput").value || "").trim();
    var phone = (document.getElementById("phoneInput").value || "").trim();
    var date = (document.getElementById("dateInput").value || "").trim();
    var time = (document.getElementById("timeInput").value || "").trim();

    var problems = [];
    if (!pkg || !veh || base == null) problems.push("package");
    if (!name || !phone) problems.push("contact");

    if (problems.length) {
      formError.hidden = false;
      if (problems.indexOf("package") !== -1) {
        formError.textContent = "Pick a package and vehicle so we can price it, then add your name and phone.";
        document.getElementById("step-package").scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        formError.textContent = "Add your name and phone so we can text you back.";
        document.getElementById("nameInput").focus({ preventScroll: true });
        document.getElementById("step-schedule").scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    formError.hidden = true;

    var addonTotal = addons.reduce(function (s, a) { return s + a.price; }, 0);
    var total = base + addonTotal;

    /* === PRODUCTION WIRING (demo is client-side only) ===
       On submit, POST this payload + the uploaded photos to a serverless
       endpoint that (1) emails James at corefmobiledetail@gmail.com and
       (2) texts him at (303) 589-8214 + sends the customer a confirmation
       (Twilio). Replace this block with a fetch() to that endpoint. */
    var payload = {
      package: pkg, packageLabel: PKG_LABEL[pkg],
      vehicle: veh, vehicleLabel: VEH_LABEL[veh],
      addons: addons.map(function (a) { return ADDON_LABEL[a.value]; }),
      basePrice: base, addonTotal: addonTotal, total: total,
      name: name, phone: phone,
      address: (document.getElementById("addrInput").value || "").trim(),
      date: date, time: time, photoCount: selectedFiles.length
    };
    console.log("Quote request (demo — wire to email + SMS in production):", payload);

    var addonText = addons.length
      ? ", with " + listJoin(addons.map(function (a) { return ADDON_LABEL[a.value].toLowerCase(); }))
      : "";
    var whenText = date ? ", on " + prettyDate(date) + " (" + time + ")" : "";

    confirmBody.innerHTML =
      "Thanks <strong>" + escapeHtml(name) + "</strong> — James will text you at <strong>" +
      escapeHtml(phone) + "</strong> to confirm your <strong>" + money(total) + " " +
      PKG_LABEL[pkg] + "</strong> for your " + VEH_LABEL[veh] + addonText + whenText + ".";

    form.hidden = true;
    confirmBox.hidden = false;
    confirmBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function listJoin(arr) {
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return arr[0] + " and " + arr[1];
    return arr.slice(0, -1).join(", ") + ", and " + arr[arr.length - 1];
  }
  function prettyDate(iso) {
    var parts = iso.split("-");
    if (parts.length !== 3) return iso;
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ============================================================
     GALLERY — fade in + lightbox
     ============================================================ */
  var galleryFigs = Array.prototype.slice.call(document.querySelectorAll(".gallery figure"));
  Array.prototype.slice.call(document.querySelectorAll(".gallery figure img")).forEach(function (img) {
    if (img.complete && img.naturalWidth) { img.classList.add("img-loaded"); }
    else { img.addEventListener("load", function () { img.classList.add("img-loaded"); }); }
  });

  var lightbox  = document.getElementById("lightbox");
  var lbImg     = document.getElementById("lbImg");
  var lbCaption = document.getElementById("lbCaption");
  var lbClose   = document.getElementById("lbClose");
  var lbBackdrop= document.getElementById("lbBackdrop");
  var lbPrev    = document.getElementById("lbPrev");
  var lbNext    = document.getElementById("lbNext");
  var lbIndex   = 0;

  if (lightbox && galleryFigs.length) {
    function openLightbox(idx) {
      lbIndex = idx;
      var fig = galleryFigs[idx];
      var img = fig.querySelector("img");
      var cap = fig.querySelector("figcaption");
      lbImg.src = img.src;
      lbImg.alt = img.alt || "";
      lbCaption.textContent = cap ? cap.textContent : "";
      lightbox.removeAttribute("hidden");
      document.body.style.overflow = "hidden";
      lbClose.focus();
    }
    function closeLightbox() {
      lightbox.setAttribute("hidden", "");
      document.body.style.overflow = "";
    }
    function showPrev() { openLightbox((lbIndex - 1 + galleryFigs.length) % galleryFigs.length); }
    function showNext() { openLightbox((lbIndex + 1) % galleryFigs.length); }

    galleryFigs.forEach(function (fig, idx) {
      fig.style.cursor = "pointer";
      fig.setAttribute("tabindex", "0");
      fig.setAttribute("role", "button");
      fig.setAttribute("aria-label", "View photo " + (idx + 1));
      fig.addEventListener("click", function () { openLightbox(idx); });
      fig.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLightbox(idx); }
      });
    });

    lbClose.addEventListener("click", closeLightbox);
    lbBackdrop.addEventListener("click", closeLightbox);
    lbPrev.addEventListener("click", showPrev);
    lbNext.addEventListener("click", showNext);
    document.addEventListener("keydown", function (e) {
      if (lightbox.hasAttribute("hidden")) return;
      if (e.key === "Escape")      { closeLightbox(); }
      else if (e.key === "ArrowLeft")  { showPrev(); }
      else if (e.key === "ArrowRight") { showNext(); }
    });
  }
})();
