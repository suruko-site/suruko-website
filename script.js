/* ═══════════════════════════════════════════════════════════════════
   SURUKO — behaviour
   Handles: header scroll, mobile menu, tabs, form validation,
            Google Sheets submission, Netlify fallback,
            WhatsApp handoff, localStorage retry queue
═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── Config ─────────────────────────────────────────────────── */
  var cfg     = window.SURUKO_CONFIG || {};
  var WA      = String(cfg.whatsappNumber || "919344240701").replace(/\D/g, "");
  var AT_TOKEN = String(cfg.airtableToken || "").trim();
  var AT_BASE  = String(cfg.airtableBase  || "").trim();
  var AT_BIZ   = "tblB0mq6LHQqTue44";
  var AT_WORK  = "tbljwtjkX3O3mbc5M";
  var PKEY     = "suruko_pending_v5";
  var AGE_MIN  = Number(cfg.workerAgeMin || 18);
  var AGE_MAX  = Number(cfg.workerAgeMax || 35);

  /* ── DOM shortcuts ───────────────────────────────────────────── */
  function $(s, p) { return (p || document).querySelector(s); }
  function $$(s, p) { return Array.prototype.slice.call((p || document).querySelectorAll(s)); }

  /* ── Scroll bar + header ─────────────────────────────────────── */
  var scrollBar = $("#scrollBar");
  var header    = $("#siteHeader");
  function onScroll() {
    var y   = window.scrollY || document.documentElement.scrollTop;
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    if (scrollBar) scrollBar.style.width = Math.min(100, y / max * 100) + "%";
    if (header)    header.classList.toggle("scrolled", y > 10);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ── Mobile menu ─────────────────────────────────────────────── */
  var navToggle  = $("#navToggle");
  var mobileMenu = $("#mobileMenu");
  if (navToggle && mobileMenu) {
    navToggle.addEventListener("click", function () {
      var open = mobileMenu.hidden;
      mobileMenu.hidden = !open;
      navToggle.setAttribute("aria-expanded", String(open));
    });
    $$("a", mobileMenu).forEach(function (a) {
      a.addEventListener("click", function () {
        mobileMenu.hidden = true;
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ── Footer year ─────────────────────────────────────────────── */
  var yr = $("#footer-year");
  if (yr) yr.textContent = new Date().getFullYear();

  /* ── Worker age dropdown ─────────────────────────────────────── */
  var ageSelect = $("#w-ag");
  if (ageSelect) {
    for (var a = AGE_MIN; a <= AGE_MAX; a++) {
      var o = document.createElement("option");
      o.value = String(a); o.textContent = String(a);
      ageSelect.appendChild(o);
    }
  }

  /* ── Date minimums ───────────────────────────────────────────── */
  var today = new Date();
  var iso   = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
                .toISOString().slice(0, 10);
  $$("[data-min-today]").forEach(function (el) { el.min = iso; });

  /* ── "Other" field reveal ────────────────────────────────────── */
  $$("[data-other-target]").forEach(function (sel) {
    var targetId = sel.dataset.otherTarget;
    var inp      = $("#" + targetId);
    if (!inp) return;
    sel.addEventListener("change", function () {
      var isOther = sel.value === "Other";
      inp.classList.toggle("show", isOther);
      inp.required = isOther;
      if (!isOther) { inp.value = ""; clearError(inp); }
    });
  });

  /* ═══════════════════════════════════════════════════════════════
     TABS
  ═══════════════════════════════════════════════════════════════ */
  var tabs = $$(".ftab");

  function activateTab(type, scrollTo) {
    tabs.forEach(function (t) {
      var on = t.dataset.tab === type;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    $$(".fpanel").forEach(function (p) {
      var expectedPanel = type === "business" ? "panel-biz" : "panel-wrk";
      var on = p.id === expectedPanel;
      p.classList.toggle("active", on);
      p.hidden = !on;
    });
    var ind = $(".ftab-indicator");
    if (ind) ind.classList.toggle("right", type === "worker");
    if (scrollTo) {
      var sec = $("#start");
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { activateTab(tab.dataset.tab); });
    tab.addEventListener("keydown", function (e) {
      var next = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = tabs[(i + 1) % tabs.length];
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === "Home") next = tabs[0];
      if (e.key === "End")  next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); activateTab(next.dataset.tab, false); next.focus(); }
    });
  });

  /* Buttons outside the form that open a tab */
  $$("[data-open-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activateTab(btn.dataset.openTab, true);
    });
  });

  /* Initialise */
  activateTab("business", false);

  /* ═══════════════════════════════════════════════════════════════
     VALIDATION
  ═══════════════════════════════════════════════════════════════ */
  /* Only letters (Latin + Tamil script + common name chars) */
  var NAME_STRIP = /[^A-Za-z\u0B80-\u0BFF\u00C0-\u024F .'\-]/g;
  var NAME_OK    = /^[A-Za-z\u0B80-\u0BFF\u00C0-\u024F][A-Za-z\u0B80-\u0BFF\u00C0-\u024F .'\-]{1,}$/;

  function fieldOf(el) { return el.closest(".fld"); }

  function setError(el, msg) {
    var wrap = fieldOf(el); if (!wrap) return;
    wrap.classList.toggle("invalid", !!msg);
    el.setAttribute("aria-invalid", msg ? "true" : "false");
    var slot = $(".ferr", wrap);
    if (slot) slot.textContent = msg ? tr(msg) : "";
  }

  function clearError(el) { setError(el, ""); }

  function validateField(el) {
    var v    = (el.value || "").trim();
    var type = el.dataset.validate;
    var wrap = fieldOf(el);

    /* skip hidden "other" fields */
    if (wrap && !wrap.offsetParent && el.classList.contains("other-input")) {
      clearError(el); return true;
    }

    if (!v && el.required) {
      setError(el, el.tagName === "SELECT" ? "Please choose an option" : "Please fill this in");
      return false;
    }

    if (type === "name" && v) {
      if (v.length < 3) { setError(el, "Please enter your full name"); return false; }
      if (!NAME_OK.test(v)) { setError(el, "Letters only — no numbers or symbols"); return false; }
    }

    if (type === "phone" && v) {
      if (!/^\d+$/.test(v))        { setError(el, "Digits only — no spaces or dashes"); return false; }
      if (v.length !== 10)         { setError(el, "Enter exactly 10 digits"); return false; }
      if (!/^[6-9]/.test(v))       { setError(el, "Indian numbers start with 6, 7, 8 or 9"); return false; }
    }

    if (el.type === "date" && v && el.min && v < el.min) {
      setError(el, "Please pick today or a later date"); return false;
    }

    clearError(el); return true;
  }

  /* Real-time: strip invalid characters while typing */
  document.addEventListener("input", function (e) {
    var el = e.target;
    if (el.dataset.validate === "name") {
      var c = el.value.replace(NAME_STRIP, "").replace(/\s{2,}/g, " ").replace(/^[\s.'\-]+/, "");
      if (c !== el.value) {
        var pos = Math.max(0, (el.selectionStart || 0) - (el.value.length - c.length));
        el.value = c;
        try { el.setSelectionRange(pos, pos); } catch (_) {}
      }
    }
    if (el.dataset.validate === "phone") {
      var d = el.value.replace(/\D/g, "");
      if (d !== el.value) el.value = d;
    }
    /* clear error once user fixes it */
    if (fieldOf(el) && fieldOf(el).classList.contains("invalid")) validateField(el);
  });

  document.addEventListener("blur", function (e) {
    if (e.target.dataset && (e.target.dataset.validate || e.target.required)) {
      validateField(e.target);
    }
  }, true);

  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el.tagName === "SELECT" || el.type === "date") {
      if (fieldOf(el) && fieldOf(el).classList.contains("invalid")) validateField(el);
    }
  });

  function validateForm(form) {
    var ok = true;
    $$("input, select, textarea", form).forEach(function (el) {
      if (el.name === "bot-field" || el.type === "hidden" || el.type === "checkbox") return;
      if (!validateField(el)) ok = false;
    });
    var cb = $('input[type="checkbox"][name="consent"]', form);
    if (cb && !cb.checked) {
      var slot = $(".consent-ferr", form);
      if (slot) { slot.textContent = tr("Please tick this to continue"); slot.classList.add("show"); }
      ok = false;
    } else if (cb) {
      var slot2 = $(".consent-ferr", form);
      if (slot2) { slot2.textContent = ""; slot2.classList.remove("show"); }
    }
    if (!ok) {
      var first = $(".fld.invalid input, .fld.invalid select, .fld.invalid textarea", form);
      if (first) first.focus();
    }
    return ok;
  }

  /* ═══════════════════════════════════════════════════════════════
     DATA COLLECTION
  ═══════════════════════════════════════════════════════════════ */
  function leadRef() {
    var d = new Date(), p = function (n) { return ("0" + n).slice(-2); };
    return "SK" + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate())
           + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function collect(form) {
    var data = {};
    new FormData(form).forEach(function (v, k) {
      data[k] = typeof v === "string" ? v.trim() : v;
    });
    delete data["bot-field"];
    /* merge "other" free-text into the main field */
    if (data.location === "Other" && data.locationOther) data.location = data.locationOther;
    if (data.area     === "Other" && data.areaOther)     data.area     = data.areaOther;
    if (data.workType === "Other" && data.workTypeOther) data.workType = "Other: " + data.workTypeOther;
    delete data.locationOther; delete data.areaOther; delete data.workTypeOther;

    data.submittedAt  = new Date().toISOString();
    data.page         = location.href;
    return data;
  }

  /* ── WhatsApp messages ───────────────────────────────────────── */
  function bizMessage(d) {
    return [
      "Hi Suruko, I need temporary workers.",
      "",
      "Ref: " + d.leadRef,
      "Company: "    + (d.company   || ""),
      "Contact: "    + (d.name      || ""),
      "WhatsApp: +91 " + (d.phone   || ""),
      "Work type: "  + (d.workType  || ""),
      "Workers: "    + (d.headcount || ""),
      "Date: "       + (d.workDate  || ""),
      "Shift: "      + (d.shift     || ""),
      "Duration: "   + (d.duration  || ""),
      "Location: "   + (d.location  || ""),
      "Pay: "        + (d.payRange  || "To discuss"),
      d.estimatedCost ? "Estimator total: ₹" + d.estimatedCost : "",
      d.notes ? "Notes: " + d.notes : "",
      "",
      "Please get in touch."
    ].filter(function (l) { return l !== undefined; }).join("\n");
  }

  function workerMessage(d) {
    return [
      "Hi Suruko, I'd like to register for work.",
      "",
      "Ref: " + d.leadRef,
      "Name: "           + (d.name            || ""),
      "WhatsApp: +91 "   + (d.phone           || ""),
      "Age: "            + (d.age             || ""),
      "Area: "           + (d.area            || ""),
      "Status: "         + (d.currentStatus   || ""),
      "Work wanted: "    + (d.workPreference  || ""),
      "Available from: " + (d.availableFrom   || ""),
      "Preferred shift: "+ (d.preferredShift  || ""),
      "Experience: "     + (d.experience      || ""),
      "Transport: "      + (d.transport       || ""),
      d.notes ? "Notes: " + d.notes : "",
      "",
      "Please contact me about suitable opportunities."
    ].filter(function (l) { return l !== undefined; }).join("\n");
  }

  function waUrl(msg) {
    return "https://wa.me/" + WA + "?text=" + encodeURIComponent(msg);
  }

  /* ── Network helpers ─────────────────────────────────────────── */
  function withTimeout(promise, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(false); } }, ms);
      promise.then(
        function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
        function ()  { if (!done) { done = true; clearTimeout(t); resolve(false); } }
      );
    });
  }

  /* ── Save via Cloudflare Worker (token stays secret on server) ── */
  var WORKER_URL = "https://suruko-submit.surukosubmissionform.workers.dev";

  function saveToAirtable(data) {
    var req = fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
    .then(function(r) {
      if (r.ok) return true;
      return r.text().then(function(t) {
        console.error("Worker error:", t);
        return false;
      });
    })
    .catch(function(err) {
      console.error("Worker fetch failed:", err);
      return false;
    });

    return withTimeout(req, 8000);
  }

  /* ── Network: Netlify Forms fallback ─────────────────────────── */
  function saveToNetlify(formName, data) {
    var body = new URLSearchParams();
    body.append("form-name", formName);
    Object.keys(data).forEach(function (k) {
      if (k !== "_secret" && data[k] != null) body.append(k, String(data[k]));
    });
    var req = fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
    return withTimeout(req, 6000);
  }

  /* ── Offline queue ───────────────────────────────────────────── */
  function queue(data) {
    try {
      var q = JSON.parse(localStorage.getItem(PKEY) || "[]");
      q.push(data);
      localStorage.setItem(PKEY, JSON.stringify(q.slice(-30)));
    } catch (_) {}
  }

  function flushQueue() {
    var q;
    try { q = JSON.parse(localStorage.getItem(PKEY) || "[]"); } catch (_) { return; }
    if (!q.length) return;
    var maxAge = (Number(cfg.pendingLeadMaxAgeHours) || 24) * 3600000;
    var now    = Date.now();
    var fresh  = q.filter(function (item) {
      return !item.submittedAt || (now - new Date(item.submittedAt).getTime()) < maxAge;
    });
    if (!fresh.length) { try { localStorage.removeItem(PKEY); } catch (_) {} return; }
    var remain = [];
    var work   = fresh.map(function (item) {
      return saveToAirtable(item).then(function (ok) { if (!ok) remain.push(item); });
    });
    Promise.all(work).then(function () {
      try { localStorage.setItem(PKEY, JSON.stringify(remain)); } catch (_) {}
      if (remain.length < fresh.length) showToast("An earlier request was saved successfully.");
    });
  }

  /* ── Toast ───────────────────────────────────────────────────── */
  var toastTimer;
  function showToast(msg, warn, ms) {
    var el = $("#toast"); if (!el) return;
    el.textContent = msg;
    el.classList.toggle("warn", !!warn);
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, ms || (warn ? 7000 : 4000));
  }

  /* ── Result panel ────────────────────────────────────────────── */
  function showResult(form, type, captured, url) {
    var panel = $(type === "business" ? "#res-biz" : "#res-wrk", form.parentElement);
    if (!panel) return;
    var isBiz = type === "business";
    var waBtn = isBiz && url
      ? "<a class='btn-wa' href='" + url + "' target='_blank' rel='noopener'>"
        + "<svg width='16' height='16' viewBox='0 0 24 24' fill='currentColor'><path d='M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Z'/></svg>"
        + "Open WhatsApp</a>"
      : "";
    panel.innerHTML =
      "<h4>" + (isBiz ? "Request received." : "Registration received.") + "</h4>"
      + "<p>Ref: <strong>" + (form.elements.leadRef ? form.elements.leadRef.value : "") + "</strong></p>"
      + (captured
          ? "<p>Your details have been saved. " + (isBiz ? "WhatsApp is opening — review the message and tap <strong>Send</strong>." : "We will message you on WhatsApp when a suitable job comes up.") + "</p>"
          : "<p>We couldn't save automatically. Please tap Send on WhatsApp so your details reach us.</p>")
      + "<div class='result-actions'>"
      + waBtn
      + "<button class='btn-reset' type='button' data-reset>Submit another</button>"
      + "</div>";
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ─────────────────────────────────────────────────────────────
     FORM SUBMIT
  ───────────────────────────────────────────────────────────── */
  var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  function handleSubmit(e) {
    e.preventDefault();
    var form = e.target;
    if (!validateForm(form)) return;

    var type     = form.elements.type ? form.elements.type.value : "business";
    var formName = form.getAttribute("name") || "business-request";

    /* stamp */
    if (form.elements.leadRef)    form.elements.leadRef.value    = leadRef();
    if (form.elements.submittedAt) form.elements.submittedAt.value = new Date().toISOString();

    var data = collect(form);
    var msg  = type === "business" ? bizMessage(data) : workerMessage(data);
    var url  = type === "business" ? waUrl(msg) : null;

    var btn = $(".btn-submit", form);
    var orig = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

    /* open WhatsApp for business side immediately (click context) */
    var popup = null;
    if (type === "business") {
      if (isMobile) { window.location.href = url; }
      else { popup = window.open(url, "_blank", "noopener"); }
    }

    Promise.all([saveToAirtable(data), saveToNetlify(formName, data)])
      .then(function (res) {
        var captured = res[0] || res[1];
        if (!captured) queue(data);

        // Netlify always captures — show positive message regardless
      showToast(
        type === "business" ? "Request received. Opening WhatsApp…" : "Registration received!",
        false
      );

        /* for worker side, open WhatsApp after save */
        if (type === "worker") {
          var workerUrl = waUrl(msg);
          setTimeout(function () {
            if (isMobile) window.location.href = workerUrl;
            else window.open(workerUrl, "_blank", "noopener");
          }, 600);
        }

        showResult(form, type, captured, url || waUrl(msg));
        if (btn) { btn.disabled = false; btn.textContent = orig; }
      });
  }

  /* Reset after "Submit another" */
  document.addEventListener("click", function (e) {
    if (!e.target.dataset || !e.target.dataset.reset) return;
    var panel = e.target.closest(".form-result");
    if (panel) panel.hidden = true;
    var formPanel = e.target.closest(".fpanel");
    if (!formPanel) return;
    var form = $("form", formPanel);
    if (!form) return;
    form.reset();
    $$(".fld.invalid", form).forEach(function (f) { f.classList.remove("invalid"); });
    $$(".other-input.show", form).forEach(function (f) { f.classList.remove("show"); f.required = false; });
    var ref = $('[name="leadRef"]', form);
    if (ref) ref.value = "";
    $$("[data-min-today]", form).forEach(function (el) { el.min = iso; });
  });

  /* Attach submit listeners */
  $$("form#form-biz, form#form-wrk").forEach(function (form) {
    form.addEventListener("submit", handleSubmit);
  });


  /* ── FAQ accordion ───────────────────────────────────────────── */
  $$(".faq-question").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".faq-item");
      var answer = item ? $(".faq-answer", item) : null;
      if (!item || !answer) return;

      var willOpen = btn.getAttribute("aria-expanded") !== "true";

      $$(".faq-item.open").forEach(function (other) {
        if (other === item) return;
        other.classList.remove("open");
        var otherBtn = $(".faq-question", other);
        var otherAnswer = $(".faq-answer", other);
        if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
        if (otherAnswer) otherAnswer.hidden = true;
      });

      item.classList.toggle("open", willOpen);
      btn.setAttribute("aria-expanded", String(willOpen));
      answer.hidden = !willOpen;
    });
  });


  /* ═══════════════════════════════════════════════════════════════
     v10 — Language switcher (English / Tamil / Hindi)
  ═══════════════════════════════════════════════════════════════ */
  var I18N = { en: {}, ta: {"Skip to form": "படிவத்துக்குச் செல்லவும்", "How it works": "எப்படி செயல்படுகிறது", "Services": "சேவைகள்", "FAQ": "அடிக்கடி கேட்கப்படும் கேள்விகள்", "Price Estimator": "விலை மதிப்பீடு", "Get started": "தொடங்குங்கள்", "Chennai · On-demand temporary workforce": "சென்னை · தேவைக்கேற்ப தற்காலிக பணியாளர்கள்", "Find Help.": "உதவி பெறுங்கள்.", "Find Work.": "வேலை பெறுங்கள்.", "Instantly.": "உடனே.", "SURUKO connects Chennai businesses that need temporary workers with people looking for flexible work — through a simple, direct process.": "SURUKO சென்னை வணிகங்களுக்கு தற்காலிக பணியாளர்களையும், நெகிழ்வான வேலை தேடும் நபர்களையும் எளிய நேரடி முறையில் இணைக்கிறது.", "I need workers": "எனக்கு பணியாளர்கள் வேண்டும்", "I need work": "எனக்கு வேலை வேண்டும்", "✓ Chennai-first": "✓ சென்னை முதன்மை", "✓ WhatsApp communication": "✓ WhatsApp தொடர்பு", "✓ Human support": "✓ மனித உதவி", "✓ Flexible work matching": "✓ நெகிழ்வான வேலை பொருத்தம்", "How Suruko works": "SURUKO எப்படி செயல்படுகிறது", "Three steps. That's it.": "மூன்று படிகள். அவ்வளவுதான்.", "No separate form page. No app to download. Fill in your details here and continue on WhatsApp.": "தனியான படிவப் பக்கம் இல்லை. செயலி பதிவிறக்கம் தேவையில்லை. உங்கள் விவரங்களை இங்கே நிரப்பி WhatsApp-ல் தொடருங்கள்.", "Fill in your details": "உங்கள் விவரங்களை நிரப்புங்கள்", "Business or worker — 2 minutes on this page. No redirects, no other apps.": "வணிகமோ பணியாளரோ — இந்தப் பக்கத்தில் சுமார் 2 நிமிடங்கள். வேறு பக்கத்திற்கோ செயலிக்கோ செல்ல வேண்டாம்.", "Suruko receives it": "SURUKO உங்கள் கோரிக்கையை பெறுகிறது", "Your request reaches us instantly. We start coordinating right away.": "உங்கள் கோரிக்கை உடனே எங்களிடம் வருகிறது. உடனடியாக ஒருங்கிணைப்பை தொடங்குகிறோம்.", "We connect on WhatsApp": "WhatsApp மூலம் இணைகிறோம்", "We follow up where you already are and sort the rest together.": "நீங்கள் பயன்படுத்தும் WhatsApp-லேயே தொடர்ந்து தொடர்பு கொண்டு மீதியை ஒருங்கிணைக்கிறோம்.", "What we cover": "நாங்கள் வழங்கும் சேவைகள்", "Flexible help for everyday business work": "தினசரி வணிக பணிகளுக்கான நெகிழ்வான உதவி", "SURUKO focuses on practical, temporary work where businesses need extra hands and people are looking for flexible opportunities.": "வணிகங்களுக்கு கூடுதல் உதவி தேவைப்படும் மற்றும் நபர்கள் நெகிழ்வான வேலை வாய்ப்புகளைத் தேடும் நடைமுறை தற்காலிக பணிகளில் SURUKO கவனம் செலுத்துகிறது.", "Packing & manufacturing": "பேக்கிங் & உற்பத்தி", "Daily helpers for packing lines, quality checking and assembly work.": "பேக்கிங் லைன், தரச் சோதனை மற்றும் அசெம்ப்ளி பணிகளுக்கான தினசரி உதவியாளர்கள்.", "Request workers →": "பணியாளர்களைக் கோருங்கள் →", "Loading & unloading": "ஏற்றுதல் & இறக்குதல்", "Helpers for trucks, warehouses and physical handling work.": "லாரி, கிடங்கு மற்றும் பொருள் கையாளும் பணிகளுக்கான உதவியாளர்கள்.", "Event & retail staffing": "நிகழ்ச்சி & ரீட்டெயில் பணியாளர்கள்", "Ground staff for events, store setup, retail support and promotional work.": "நிகழ்ச்சி, கடை அமைப்பு, ரீட்டெயில் உதவி மற்றும் புரமோஷன் பணிகளுக்கான தரை நிலை பணியாளர்கள்.", "Field & delivery work": "வெளிப்பணி & டெலிவரி", "Running, delivery and outdoor helpers for short-term requirements.": "குறுகிய கால தேவைகளுக்கான ரன்னிங், டெலிவரி மற்றும் வெளிப்பணி உதவியாளர்கள்.", "Tell us what you need": "உங்களுக்கு என்ன தேவை என்பதைச் சொல்லுங்கள்", "Pick your side, fill the form, we'll reach you on WhatsApp.": "உங்கள் வகையைத் தேர்வு செய்து படிவத்தை நிரப்புங்கள்; WhatsApp மூலம் உங்களைத் தொடர்புகொள்வோம்.", "Business request": "வணிக கோரிக்கை", "~2 minutes": "~2 நிமிடங்கள்", "Your name": "உங்கள் பெயர்", "Company name": "நிறுவன பெயர்", "WhatsApp number": "WhatsApp எண்", "Work type": "பணி வகை", "Select work type": "பணி வகையைத் தேர்வு செய்யவும்", "Packing & warehouse work": "பேக்கிங் & கிடங்கு பணி", "Event support & setup": "நிகழ்ச்சி உதவி & அமைப்பு", "Retail & store help": "ரீட்டெயில் & கடை உதவி", "Housekeeping & cleaning": "ஹவுஸ்கீப்பிங் & சுத்தம்", "Data entry support": "டேட்டா என்ட்ரி உதவி", "Delivery & field work": "டெலிவரி & வெளிப்பணி", "Other": "மற்றவை", "Workers needed": "தேவையான பணியாளர்கள்", "Select count": "எண்ணிக்கையைத் தேர்வு செய்யவும்", "More than 50": "50-க்கும் மேல்", "Work date": "பணி தேதி", "Shift timing": "ஷிப்ட் நேரம்", "Select timing": "நேரத்தைத் தேர்வு செய்யவும்", "Morning — 6 AM to 2 PM": "காலை — 6 முதல் 2 வரை", "Day — 9 AM to 6 PM": "பகல் — 9 முதல் 6 வரை", "Evening — 2 PM to 10 PM": "மாலை — 2 முதல் 10 வரை", "Night — 10 PM to 6 AM": "இரவு — 10 முதல் 6 வரை", "Full day": "முழு நாள்", "Flexible": "நெகிழ்வான நேரம்", "Booking duration": "பதிவு காலம்", "Select hours": "மணிநேரத்தைத் தேர்வு செய்யவும்", "Up to 2 hours": "2 மணி நேரம் வரை", "3 hours": "3 மணி நேரம்", "4 hours": "4 மணி நேரம்", "5 hours": "5 மணி நேரம்", "8 hours": "8 மணி நேரம்", "Work location": "பணி இடம்", "Select area": "பகுதியைத் தேர்வு செய்யவும்", "Pay per person": "ஒருவருக்கான ஊதியம்", "(optional)": "(விருப்பம்)", "To discuss": "பேசி முடிவு செய்யலாம்", "Under ₹500/day": "₹500/நாளுக்கு கீழ்", "₹500–₹700/day": "₹500–₹700/நாள்", "₹700–₹900/day": "₹700–₹900/நாள்", "₹900–₹1,200/day": "₹900–₹1,200/நாள்", "₹1,200–₹1,500/day": "₹1,200–₹1,500/நாள்", "Above ₹1,500/day": "₹1,500/நாளுக்கு மேல்", "Other details": "மற்ற விவரங்கள்", "I agree that Suruko may use these details to coordinate this request and contact me on WhatsApp.": "இந்த கோரிக்கையை ஒருங்கிணைக்கவும் WhatsApp மூலம் என்னைத் தொடர்புகொள்ளவும் SURUKO இந்த விவரங்களைப் பயன்படுத்த ஒப்புக்கொள்கிறேன்.", "Privacy notice": "தனியுரிமை அறிவிப்பு", "Submit & continue on WhatsApp": "சமர்ப்பித்து WhatsApp-ல் தொடருங்கள்", "WhatsApp will open with your details. Tap Send to reach us.": "உங்கள் விவரங்களுடன் WhatsApp திறக்கும். எங்களை அணுக Send அழுத்துங்கள்.", "Worker registration": "பணியாளர் பதிவு", "Ages 18–35": "வயது 18–35", "Full name": "முழுப் பெயர்", "Age": "வயது", "Select age": "வயதைத் தேர்வு செய்யவும்", "Your area": "உங்கள் பகுதி", "Work status": "வேலை நிலை", "Select status": "நிலையைத் தேர்வு செய்யவும்", "Looking for work / வேலை தேடுகிறேன்": "வேலை தேடுகிறேன்", "Working but want extra shifts": "வேலை செய்கிறேன்; கூடுதல் ஷிப்ட் வேண்டும்", "Student looking for part-time": "பகுதி நேர வேலை தேடும் மாணவர்", "Available immediately": "உடனே பணிக்கு தயாராக உள்ளேன்", "Work preference": "விருப்பமான பணி", "Select preference": "விருப்பத்தைத் தேர்வு செய்யவும்", "Packing & warehouse": "பேக்கிங் & கிடங்கு", "Event support": "நிகழ்ச்சி உதவி", "Data entry": "டேட்டா என்ட்ரி", "Any work / எந்த வேலையும் சரி": "எந்த வேலையும் சரி", "Available from": "எப்போது முதல் கிடைக்கும்", "Preferred shift": "விருப்பமான ஷிப்ட்", "Select shift": "ஷிப்டைத் தேர்வு செய்யவும்", "Weekends only": "வார இறுதி மட்டும்", "Any shift": "எந்த ஷிப்டும்", "Experience": "அனுபவம்", "Select experience": "அனுபவத்தைத் தேர்வு செய்யவும்", "No experience yet": "அனுபவம் இல்லை", "Less than 6 months": "6 மாதங்களுக்குக் குறைவாக", "6 months to 1 year": "6 மாதம் முதல் 1 வருடம்", "1 to 3 years": "1 முதல் 3 வருடங்கள்", "More than 3 years": "3 வருடங்களுக்கு மேல்", "Transport": "போக்குவரத்து", "Select transport": "போக்குவரத்தைத் தேர்வு செய்யவும்", "I have my own two-wheeler": "எனக்கு சொந்த இருசக்கர வாகனம் உள்ளது", "I can use bus or train": "பஸ் அல்லது ரயில் பயன்படுத்தலாம்", "I prefer work near my area": "என் பகுதியருகில் வேலை விரும்புகிறேன்", "Anything else": "மேலும் ஏதேனும்", "I am 18 or older and agree that Suruko may contact me on WhatsApp about work.": "எனக்கு 18 வயது அல்லது அதற்கு மேல்; வேலை தொடர்பாக SURUKO WhatsApp மூலம் என்னைத் தொடர்புகொள்ள ஒப்புக்கொள்கிறேன்.", "Register & continue on WhatsApp": "பதிவு செய்து WhatsApp-ல் தொடருங்கள்", "Registering does not guarantee work. We'll message you when a suitable job comes up.": "பதிவு செய்தால் வேலை உறுதி அல்ல. பொருத்தமான வாய்ப்பு வந்தால் WhatsApp மூலம் தகவல் தருவோம்.", "Why SURUKO": "ஏன் SURUKO", "A simpler way for local businesses and workers to find each other.": "உள்ளூர் வணிகங்களும் பணியாளர்களும் ஒருவரை ஒருவர் கண்டுபிடிக்க எளிய வழி.", "SURUKO is in its MVP stage. We keep the process straightforward: collect the requirement, understand the work, and help both sides connect.": "SURUKO தற்போது MVP நிலையில் உள்ளது. தேவையைப் பெறுதல், பணியைப் புரிந்துகொள்ளுதல், இருபுறத்தையும் இணைத்தல் — செயல்முறை எளிமையாக வைக்கப்படுகிறது.", "Simple worker requests.": "எளிய பணியாளர் கோரிக்கைகள்.", "Businesses can share what they need without going through a long hiring process.": "நீண்ட நியமன செயல்முறை இல்லாமல் வணிகங்கள் தங்கள் தேவையை பகிரலாம்.", "Local workforce matching.": "உள்ளூர் பணியாளர் பொருத்தம்.", "We are starting with Chennai and nearby industrial areas, where local coordination matters.": "சென்னை மற்றும் அருகிலுள்ள தொழிற்பகுதிகளில் இருந்து தொடங்குகிறோம்; உள்ளூர் ஒருங்கிணைப்பு முக்கியம்.", "WhatsApp-first communication.": "WhatsApp முதன்மை தொடர்பு.", "No extra app to install. We can continue the conversation in a tool people already use.": "வேறு செயலி நிறுவ தேவையில்லை. மக்கள் ஏற்கனவே பயன்படுத்தும் WhatsApp-ல் தொடரலாம்.", "Flexible work opportunities.": "நெகிழ்வான வேலை வாய்ப்புகள்.", "Workers can register their interests and availability for temporary work that may suit them.": "பணியாளர்கள் தங்களின் விருப்பம் மற்றும் கிடைக்கும் நேரத்தை பதிவு செய்து பொருத்தமான தற்காலிக வேலை வாய்ப்புகளுக்காக பரிசீலிக்கப்படலாம்.", "Get started now": "இப்போது தொடங்குங்கள்", "Example conversation": "உதாரண உரையாடல்", "Example only": "உதாரணம் மட்டும்", "Simple. Familiar. Direct.": "எளிமை. பழக்கம். நேர்மை.", "Help center": "உதவி மையம்", "Frequently Asked Questions": "அடிக்கடி கேட்கப்படும் கேள்விகள்", "Everything you need to know before using SURUKO.": "SURUKO பயன்படுத்துவதற்கு முன் தெரிந்துகொள்ள வேண்டியவை.", "What is SURUKO?": "SURUKO என்றால் என்ன?", "SURUKO is a platform that helps connect businesses looking for temporary workers with people looking for flexible work opportunities.": "SURUKO என்பது தற்காலிக பணியாளர்களைத் தேடும் வணிகங்களையும் நெகிழ்வான வேலை வாய்ப்புகளைத் தேடும் நபர்களையும் இணைக்க உதவும் தளம்.", "What type of workers can businesses look for?": "வணிகங்கள் எந்த வகை பணியாளர்களைத் தேடலாம்?", "Businesses can share requirements for packing, warehouse support, production support, loading and unloading, event staff, retail help, field support and similar temporary work.": "பேக்கிங், கிடங்கு உதவி, உற்பத்தி உதவி, ஏற்றுதல்/இறக்குதல், நிகழ்ச்சி பணியாளர்கள், ரீட்டெயில் உதவி, வெளிப்பணி போன்ற தற்காலிக தேவைகளை வணிகங்கள் பகிரலாம்.", "Which areas does SURUKO currently focus on?": "SURUKO தற்போது எந்த பகுதிகளில் கவனம் செலுத்துகிறது?", "SURUKO is starting with Chennai and nearby industrial areas including Thirumudivakkam, Oragadam, Vallam Vadagal, Sriperumbudur, Ambattur and Guindy.": "SURUKO சென்னை மற்றும் திருமுடிவாக்கம், ஒரகடம், வல்லம் வடகல், ஸ்ரீபெரும்புதூர், அம்பத்தூர், கிண்டி உள்ளிட்ட அருகிலுள்ள தொழிற்பகுதிகளில் இருந்து தொடங்குகிறது.", "Does submitting a business request guarantee worker availability?": "வணிக கோரிக்கை சமர்ப்பித்தால் பணியாளர்கள் கிடைப்பது உறுதியா?", "No. SURUKO helps businesses and workers discover and connect with each other. Availability depends on the requirement, location, timing and interested workers.": "இல்லை. SURUKO வணிகங்களும் பணியாளர்களும் ஒருவரை ஒருவர் கண்டுபிடித்து இணைவதற்கு உதவுகிறது. கிடைப்பது தேவை, இடம், நேரம் மற்றும் ஆர்வமுள்ள பணியாளர்களை பொறுத்தது.", "Does registering as a worker guarantee a job?": "பணியாளராக பதிவு செய்தால் வேலை உறுதியா?", "No. Registration allows SURUKO to consider you for suitable opportunities, but it does not guarantee work.": "இல்லை. பதிவு செய்வதால் பொருத்தமான வாய்ப்புகளுக்காக உங்களை பரிசீலிக்க முடியும்; வேலை உறுதி அல்ல.", "Who decides the work timing and payment?": "பணி நேரமும் ஊதியமும் யார் முடிவு செய்கிறார்கள்?", "Work details such as timing, pay, location and responsibilities should be agreed between the business and worker before the work starts.": "பணி தொடங்குவதற்கு முன் நேரம், ஊதியம், இடம், பொறுப்புகள் போன்ற விவரங்களை வணிகமும் பணியாளரும் ஒப்புக்கொள்ள வேண்டும்.", "Is SURUKO the employer of the workers?": "SURUKO பணியாளர்களின் முதலாளியா?", "No. At the MVP stage, SURUKO operates as a matching platform that helps businesses and workers discover and connect with each other.": "இல்லை. MVP நிலையில் SURUKO வணிகங்களையும் பணியாளர்களையும் கண்டுபிடித்து இணைக்க உதவும் பொருத்தும் தளமாக செயல்படுகிறது.", "How do businesses and workers communicate?": "வணிகங்களும் பணியாளர்களும் எப்படி தொடர்பு கொள்கிறார்கள்?", "SURUKO currently uses WhatsApp as the main communication channel for simple and familiar coordination.": "எளிய மற்றும் பழக்கமான ஒருங்கிணைப்புக்காக SURUKO தற்போது WhatsApp-ஐ முக்கிய தொடர்பு வழியாக பயன்படுத்துகிறது.", "Do I need to install an app?": "செயலி நிறுவ வேண்டுமா?", "No. You can submit a worker requirement or register for work directly through the SURUKO website.": "இல்லை. SURUKO இணையதளத்திலேயே பணியாளர் தேவையை சமர்ப்பிக்கலாம் அல்லது வேலைக்காக பதிவு செய்யலாம்.", "How can I contact SURUKO?": "SURUKO-வை எப்படி தொடர்புகொள்வது?", "You can reach SURUKO through WhatsApp, call +91 93442 40701, or email hello@suruko.in.": "WhatsApp, +91 93442 40701 தொலைபேசி அல்லது hello@suruko.in மின்னஞ்சல் மூலம் SURUKO-வை தொடர்புகொள்ளலாம்.", "Need people by tomorrow?": "நாளைக்குள் பணியாளர்கள் வேண்டுமா?", "Or ready to start work?": "அல்லது வேலை தொடங்க தயாரா?", "Takes two minutes. We'll handle the rest.": "இரண்டு நிமிடங்கள் போதும். மீதியை நாங்கள் ஒருங்கிணைக்கிறோம்.", "Find Help. Find Work. Instantly.": "உதவி பெறுங்கள். வேலை பெறுங்கள். உடனே.", "Suruko is a Chennai-based startup currently in MVP stage, connecting businesses and workers through WhatsApp.": "Suruko என்பது சென்னை அடிப்படையிலான MVP தொடக்க நிறுவனம்; WhatsApp மூலம் வணிகங்களையும் பணியாளர்களையும் இணைக்கிறது.", "Contact": "தொடர்பு", "WhatsApp us": "WhatsApp-ல் தொடர்பு கொள்ளுங்கள்", "Scan to chat on WhatsApp": "WhatsApp உரையாடலுக்கு ஸ்கேன் செய்யவும்", "Quick links": "விரைவு இணைப்புகள்", "Legal": "சட்ட தகவல்", "Terms of use": "பயன்பாட்டு விதிமுறைகள்", "© 2026 Suruko. All rights reserved. Chennai, Tamil Nadu.": "© 2026 Suruko. அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை. சென்னை, தமிழ்நாடு.", "Suruko facilitates connections — we are not a staffing agency, employer or contractor.": "Suruko இணைப்பை எளிதாக்குகிறது — நாங்கள் பணியாளர் முகமை, முதலாளர் அல்லது ஒப்பந்ததாரர் அல்ல.", "Calculate an estimated labour cost instantly.": "தொழிலாளர் செலவின் மதிப்பீட்டை உடனே கணக்கிடுங்கள்.", "Select service": "சேவையைத் தேர்வு செய்யவும்", "Booking duration (hours)": "பதிவு காலம் (மணிநேரம்)", "Number of helpers": "உதவியாளர்கள் எண்ணிக்கை", "Rate per helper (up to 2 hrs)": "ஒரு உதவியாளருக்கான கட்டணம் (2 மணி வரை)", "Total helpers multiplier": "மொத்த உதவியாளர் பெருக்கி", "Estimated Cost": "மதிப்பிடப்பட்ட செலவு", "Estimate only. Availability and final work details are confirmed after SURUKO contacts you.": "இது ஒரு மதிப்பீடு மட்டும். SURUKO உங்களைத் தொடர்புகொண்ட பிறகு கிடைப்பதும் இறுதி பணி விவரங்களும் உறுதிப்படுத்தப்படும்.", "e.g. Arjun Kumar": "உதா. அர்ஜுன் குமார்", "e.g. ABC Industries": "உதா. ABC Industries", "10-digit number": "10 இலக்க எண்", "Type your area": "உங்கள் பகுதியை உள்ளிடுங்கள்", "Skills, dress code, food, transport…": "திறன்கள், உடை விதி, உணவு, போக்குவரத்து…", "Your area / உங்கள் பகுதி": "உங்கள் பகுதி", "Languages, skills, preferred area...": "மொழிகள், திறன்கள், விருப்ப பகுதி...", "Please choose an option": "ஒரு விருப்பத்தைத் தேர்வு செய்யவும்", "Please fill this in": "இதை நிரப்பவும்", "Please enter your full name": "உங்கள் முழுப் பெயரை உள்ளிடவும்", "Letters only — no numbers or symbols": "எழுத்துகள் மட்டும் — எண்கள் அல்லது குறியீடுகள் வேண்டாம்", "Digits only — no spaces or dashes": "எண்கள் மட்டும் — இடைவெளி அல்லது டாஷ் வேண்டாம்", "Enter exactly 10 digits": "சரியாக 10 இலக்கங்கள் உள்ளிடவும்", "Indian numbers start with 6, 7, 8 or 9": "இந்திய மொபைல் எண்கள் 6, 7, 8 அல்லது 9-ல் தொடங்கும்", "Please pick today or a later date": "இன்றைய தேதி அல்லது அதற்குப் பிறகான தேதியைத் தேர்வு செய்யவும்", "Please tick this to continue": "தொடர இதைத் தேர்வு செய்யவும்"}, hi: {"Skip to form": "फ़ॉर्म पर जाएँ", "How it works": "यह कैसे काम करता है", "Services": "सेवाएँ", "FAQ": "सामान्य प्रश्न", "Price Estimator": "मूल्य अनुमान", "Get started": "शुरू करें", "Chennai · On-demand temporary workforce": "चेन्नई · मांग पर अस्थायी कार्यबल", "Find Help.": "मदद पाएँ.", "Find Work.": "काम पाएँ.", "Instantly.": "तुरंत.", "SURUKO connects Chennai businesses that need temporary workers with people looking for flexible work — through a simple, direct process.": "SURUKO चेन्नई के उन व्यवसायों को, जिन्हें अस्थायी कामगार चाहिए, लचीला काम ढूँढ रहे लोगों से एक सरल और सीधे तरीके से जोड़ता है.", "I need workers": "मुझे कामगार चाहिए", "I need work": "मुझे काम चाहिए", "✓ Chennai-first": "✓ चेन्नई-प्रथम", "✓ WhatsApp communication": "✓ WhatsApp संवाद", "✓ Human support": "✓ मानवीय सहायता", "✓ Flexible work matching": "✓ लचीला काम मिलान", "How Suruko works": "SURUKO कैसे काम करता है", "Three steps. That's it.": "सिर्फ तीन चरण.", "No separate form page. No app to download. Fill in your details here and continue on WhatsApp.": "अलग फ़ॉर्म पेज नहीं. कोई ऐप डाउनलोड नहीं. अपनी जानकारी यहीं भरें और WhatsApp पर आगे बढ़ें.", "Fill in your details": "अपनी जानकारी भरें", "Business or worker — 2 minutes on this page. No redirects, no other apps.": "व्यवसाय या कामगार — इस पेज पर लगभग 2 मिनट. कोई रीडायरेक्ट या दूसरा ऐप नहीं.", "Suruko receives it": "SURUKO को आपका अनुरोध मिलता है", "Your request reaches us instantly. We start coordinating right away.": "आपका अनुरोध तुरंत हमारे पास पहुँचता है और हम समन्वय शुरू कर देते हैं.", "We connect on WhatsApp": "हम WhatsApp पर जुड़ते हैं", "We follow up where you already are and sort the rest together.": "जहाँ आप पहले से हैं, उसी WhatsApp पर आगे बात करके बाकी प्रक्रिया पूरी करते हैं.", "What we cover": "हम क्या कवर करते हैं", "Flexible help for everyday business work": "रोज़मर्रा के व्यवसायिक काम के लिए लचीली मदद", "SURUKO focuses on practical, temporary work where businesses need extra hands and people are looking for flexible opportunities.": "SURUKO ऐसे व्यावहारिक अस्थायी काम पर केंद्रित है जहाँ व्यवसायों को अतिरिक्त हाथ चाहिए और लोग लचीले अवसर ढूँढ रहे हैं.", "Packing & manufacturing": "पैकिंग और मैन्युफैक्चरिंग", "Daily helpers for packing lines, quality checking and assembly work.": "पैकिंग लाइन, गुणवत्ता जाँच और असेंबली काम के लिए दैनिक सहायक.", "Request workers →": "कामगार माँगें →", "Loading & unloading": "लोडिंग और अनलोडिंग", "Helpers for trucks, warehouses and physical handling work.": "ट्रक, वेयरहाउस और सामान संभालने के काम के लिए सहायक.", "Event & retail staffing": "इवेंट और रिटेल स्टाफ", "Ground staff for events, store setup, retail support and promotional work.": "इवेंट, स्टोर सेटअप, रिटेल सहायता और प्रमोशन के लिए ग्राउंड स्टाफ.", "Field & delivery work": "फ़ील्ड और डिलीवरी काम", "Running, delivery and outdoor helpers for short-term requirements.": "कम अवधि की जरूरतों के लिए रनिंग, डिलीवरी और आउटडोर सहायक.", "Tell us what you need": "बताइए आपको क्या चाहिए", "Pick your side, fill the form, we'll reach you on WhatsApp.": "अपना विकल्प चुनें, फ़ॉर्म भरें; हम WhatsApp पर संपर्क करेंगे.", "Business request": "व्यवसाय अनुरोध", "~2 minutes": "~2 मिनट", "Your name": "आपका नाम", "Company name": "कंपनी का नाम", "WhatsApp number": "WhatsApp नंबर", "Work type": "काम का प्रकार", "Select work type": "काम का प्रकार चुनें", "Packing & warehouse work": "पैकिंग और वेयरहाउस काम", "Event support & setup": "इवेंट सहायता और सेटअप", "Retail & store help": "रिटेल और स्टोर सहायता", "Housekeeping & cleaning": "हाउसकीपिंग और सफाई", "Data entry support": "डेटा एंट्री सहायता", "Delivery & field work": "डिलीवरी और फ़ील्ड काम", "Other": "अन्य", "Workers needed": "कितने कामगार चाहिए", "Select count": "संख्या चुनें", "More than 50": "50 से अधिक", "Work date": "काम की तारीख", "Shift timing": "शिफ्ट समय", "Select timing": "समय चुनें", "Morning — 6 AM to 2 PM": "सुबह — 6 AM से 2 PM", "Day — 9 AM to 6 PM": "दिन — 9 AM से 6 PM", "Evening — 2 PM to 10 PM": "शाम — 2 PM से 10 PM", "Night — 10 PM to 6 AM": "रात — 10 PM से 6 AM", "Full day": "पूरा दिन", "Flexible": "लचीला", "Booking duration": "बुकिंग अवधि", "Select hours": "घंटे चुनें", "Up to 2 hours": "2 घंटे तक", "3 hours": "3 घंटे", "4 hours": "4 घंटे", "5 hours": "5 घंटे", "8 hours": "8 घंटे", "Work location": "काम का स्थान", "Select area": "क्षेत्र चुनें", "Pay per person": "प्रति व्यक्ति भुगतान", "(optional)": "(वैकल्पिक)", "To discuss": "बात करके तय करें", "Under ₹500/day": "₹500/दिन से कम", "₹500–₹700/day": "₹500–₹700/दिन", "₹700–₹900/day": "₹700–₹900/दिन", "₹900–₹1,200/day": "₹900–₹1,200/दिन", "₹1,200–₹1,500/day": "₹1,200–₹1,500/दिन", "Above ₹1,500/day": "₹1,500/दिन से अधिक", "Other details": "अन्य विवरण", "I agree that Suruko may use these details to coordinate this request and contact me on WhatsApp.": "मैं सहमत हूँ कि SURUKO इस अनुरोध के समन्वय और WhatsApp पर संपर्क के लिए इन विवरणों का उपयोग कर सकता है.", "Privacy notice": "गोपनीयता सूचना", "Submit & continue on WhatsApp": "सबमिट करें और WhatsApp पर जारी रखें", "WhatsApp will open with your details. Tap Send to reach us.": "आपकी जानकारी के साथ WhatsApp खुलेगा. हमसे संपर्क के लिए Send दबाएँ.", "Worker registration": "कामगार पंजीकरण", "Ages 18–35": "आयु 18–35", "Full name": "पूरा नाम", "Age": "आयु", "Select age": "आयु चुनें", "Your area": "आपका क्षेत्र", "Work status": "काम की स्थिति", "Select status": "स्थिति चुनें", "Looking for work / வேலை தேடுகிறேன்": "काम की तलाश में हूँ", "Working but want extra shifts": "काम कर रहा/रही हूँ, अतिरिक्त शिफ्ट चाहिए", "Student looking for part-time": "पार्ट-टाइम काम ढूँढने वाला छात्र/छात्रा", "Available immediately": "तुरंत उपलब्ध", "Work preference": "काम की पसंद", "Select preference": "पसंद चुनें", "Packing & warehouse": "पैकिंग और वेयरहाउस", "Event support": "इवेंट सहायता", "Data entry": "डेटा एंट्री", "Any work / எந்த வேலையும் சரி": "कोई भी काम", "Available from": "कब से उपलब्ध", "Preferred shift": "पसंदीदा शिफ्ट", "Select shift": "शिफ्ट चुनें", "Weekends only": "केवल सप्ताहांत", "Any shift": "कोई भी शिफ्ट", "Experience": "अनुभव", "Select experience": "अनुभव चुनें", "No experience yet": "अभी अनुभव नहीं", "Less than 6 months": "6 महीने से कम", "6 months to 1 year": "6 महीने से 1 वर्ष", "1 to 3 years": "1 से 3 वर्ष", "More than 3 years": "3 वर्ष से अधिक", "Transport": "यातायात", "Select transport": "यातायात चुनें", "I have my own two-wheeler": "मेरे पास अपना दोपहिया वाहन है", "I can use bus or train": "मैं बस या ट्रेन का उपयोग कर सकता/सकती हूँ", "I prefer work near my area": "मैं अपने क्षेत्र के पास काम पसंद करता/करती हूँ", "Anything else": "और कुछ", "I am 18 or older and agree that Suruko may contact me on WhatsApp about work.": "मेरी आयु 18 या अधिक है और मैं काम के बारे में SURUKO द्वारा WhatsApp पर संपर्क करने से सहमत हूँ.", "Register & continue on WhatsApp": "पंजीकरण करें और WhatsApp पर जारी रखें", "Registering does not guarantee work. We'll message you when a suitable job comes up.": "पंजीकरण से काम की गारंटी नहीं है. उपयुक्त अवसर मिलने पर हम WhatsApp पर संदेश भेजेंगे.", "Why SURUKO": "SURUKO क्यों", "A simpler way for local businesses and workers to find each other.": "स्थानीय व्यवसायों और कामगारों के लिए एक-दूसरे को खोजने का सरल तरीका.", "SURUKO is in its MVP stage. We keep the process straightforward: collect the requirement, understand the work, and help both sides connect.": "SURUKO अभी MVP चरण में है. प्रक्रिया सरल है: आवश्यकता लें, काम समझें और दोनों पक्षों को जोड़ें.", "Simple worker requests.": "सरल कामगार अनुरोध.", "Businesses can share what they need without going through a long hiring process.": "व्यवसाय लंबी भर्ती प्रक्रिया के बिना अपनी आवश्यकता साझा कर सकते हैं.", "Local workforce matching.": "स्थानीय कार्यबल मिलान.", "We are starting with Chennai and nearby industrial areas, where local coordination matters.": "हम चेन्नई और आसपास के औद्योगिक क्षेत्रों से शुरू कर रहे हैं, जहाँ स्थानीय समन्वय महत्वपूर्ण है.", "WhatsApp-first communication.": "WhatsApp-प्रथम संवाद.", "No extra app to install. We can continue the conversation in a tool people already use.": "कोई अतिरिक्त ऐप इंस्टॉल नहीं करना. बातचीत उसी WhatsApp पर जारी रहती है जिसे लोग पहले से उपयोग करते हैं.", "Flexible work opportunities.": "लचीले काम के अवसर.", "Workers can register their interests and availability for temporary work that may suit them.": "कामगार अपनी रुचि और उपलब्धता दर्ज कर सकते हैं ताकि उपयुक्त अस्थायी काम के लिए उन्हें देखा जा सके.", "Get started now": "अभी शुरू करें", "Example conversation": "उदाहरण बातचीत", "Example only": "केवल उदाहरण", "Simple. Familiar. Direct.": "सरल. परिचित. सीधा.", "Help center": "सहायता केंद्र", "Frequently Asked Questions": "अक्सर पूछे जाने वाले प्रश्न", "Everything you need to know before using SURUKO.": "SURUKO उपयोग करने से पहले जानने योग्य बातें.", "What is SURUKO?": "SURUKO क्या है?", "SURUKO is a platform that helps connect businesses looking for temporary workers with people looking for flexible work opportunities.": "SURUKO एक प्लेटफ़ॉर्म है जो अस्थायी कामगार खोज रहे व्यवसायों को लचीले काम के अवसर खोज रहे लोगों से जोड़ने में मदद करता है.", "What type of workers can businesses look for?": "व्यवसाय किस प्रकार के कामगार खोज सकते हैं?", "Businesses can share requirements for packing, warehouse support, production support, loading and unloading, event staff, retail help, field support and similar temporary work.": "व्यवसाय पैकिंग, वेयरहाउस सहायता, उत्पादन सहायता, लोडिंग-अनलोडिंग, इवेंट स्टाफ, रिटेल सहायता, फ़ील्ड सहायता और ऐसे ही अस्थायी काम की जरूरतें साझा कर सकते हैं.", "Which areas does SURUKO currently focus on?": "SURUKO अभी किन क्षेत्रों पर ध्यान देता है?", "SURUKO is starting with Chennai and nearby industrial areas including Thirumudivakkam, Oragadam, Vallam Vadagal, Sriperumbudur, Ambattur and Guindy.": "SURUKO चेन्नई और आसपास के औद्योगिक क्षेत्रों जैसे Thirumudivakkam, Oragadam, Vallam Vadagal, Sriperumbudur, Ambattur और Guindy से शुरू कर रहा है.", "Does submitting a business request guarantee worker availability?": "क्या व्यवसाय अनुरोध देने से कामगार उपलब्धता की गारंटी है?", "No. SURUKO helps businesses and workers discover and connect with each other. Availability depends on the requirement, location, timing and interested workers.": "नहीं. SURUKO व्यवसायों और कामगारों को एक-दूसरे से खोजने और जुड़ने में मदद करता है. उपलब्धता आवश्यकता, स्थान, समय और इच्छुक कामगारों पर निर्भर करती है.", "Does registering as a worker guarantee a job?": "क्या कामगार के रूप में पंजीकरण से नौकरी की गारंटी है?", "No. Registration allows SURUKO to consider you for suitable opportunities, but it does not guarantee work.": "नहीं. पंजीकरण से SURUKO आपको उपयुक्त अवसरों के लिए देख सकता है, लेकिन काम की गारंटी नहीं है.", "Who decides the work timing and payment?": "काम का समय और भुगतान कौन तय करता है?", "Work details such as timing, pay, location and responsibilities should be agreed between the business and worker before the work starts.": "काम शुरू होने से पहले समय, भुगतान, स्थान और जिम्मेदारियों जैसी बातों पर व्यवसाय और कामगार की सहमति होनी चाहिए.", "Is SURUKO the employer of the workers?": "क्या SURUKO कामगारों का नियोक्ता है?", "No. At the MVP stage, SURUKO operates as a matching platform that helps businesses and workers discover and connect with each other.": "नहीं. MVP चरण में SURUKO एक मिलान प्लेटफ़ॉर्म के रूप में काम करता है जो व्यवसायों और कामगारों को एक-दूसरे से खोजने और जुड़ने में मदद करता है.", "How do businesses and workers communicate?": "व्यवसाय और कामगार कैसे संवाद करते हैं?", "SURUKO currently uses WhatsApp as the main communication channel for simple and familiar coordination.": "सरल और परिचित समन्वय के लिए SURUKO अभी WhatsApp को मुख्य संवाद माध्यम के रूप में उपयोग करता है.", "Do I need to install an app?": "क्या मुझे ऐप इंस्टॉल करना होगा?", "No. You can submit a worker requirement or register for work directly through the SURUKO website.": "नहीं. आप SURUKO वेबसाइट पर सीधे कामगार आवश्यकता जमा कर सकते हैं या काम के लिए पंजीकरण कर सकते हैं.", "How can I contact SURUKO?": "मैं SURUKO से कैसे संपर्क करूँ?", "You can reach SURUKO through WhatsApp, call +91 93442 40701, or email hello@suruko.in.": "आप WhatsApp, +91 93442 40701 पर कॉल या hello@suruko.in पर ईमेल करके SURUKO से संपर्क कर सकते हैं.", "Need people by tomorrow?": "कल तक लोग चाहिए?", "Or ready to start work?": "या काम शुरू करने के लिए तैयार हैं?", "Takes two minutes. We'll handle the rest.": "दो मिनट लगते हैं. बाकी हम संभालेंगे.", "Find Help. Find Work. Instantly.": "मदद पाएँ. काम पाएँ. तुरंत.", "Suruko is a Chennai-based startup currently in MVP stage, connecting businesses and workers through WhatsApp.": "Suruko चेन्नई आधारित MVP स्टार्टअप है जो WhatsApp के माध्यम से व्यवसायों और कामगारों को जोड़ता है.", "Contact": "संपर्क", "WhatsApp us": "WhatsApp करें", "Scan to chat on WhatsApp": "WhatsApp चैट के लिए स्कैन करें", "Quick links": "त्वरित लिंक", "Legal": "कानूनी", "Terms of use": "उपयोग की शर्तें", "© 2026 Suruko. All rights reserved. Chennai, Tamil Nadu.": "© 2026 Suruko. सर्वाधिकार सुरक्षित. चेन्नई, तमिलनाडु.", "Suruko facilitates connections — we are not a staffing agency, employer or contractor.": "Suruko कनेक्शन सुगम बनाता है — हम स्टाफिंग एजेंसी, नियोक्ता या ठेकेदार नहीं हैं.", "Calculate an estimated labour cost instantly.": "अनुमानित श्रम लागत तुरंत देखें.", "Select service": "सेवा चुनें", "Booking duration (hours)": "बुकिंग अवधि (घंटे)", "Number of helpers": "सहायकों की संख्या", "Rate per helper (up to 2 hrs)": "प्रति सहायक दर (2 घंटे तक)", "Total helpers multiplier": "कुल सहायक गुणक", "Estimated Cost": "अनुमानित लागत", "Estimate only. Availability and final work details are confirmed after SURUKO contacts you.": "यह केवल अनुमान है. SURUKO के संपर्क के बाद उपलब्धता और अंतिम काम की जानकारी की पुष्टि होगी.", "e.g. Arjun Kumar": "जैसे Arjun Kumar", "e.g. ABC Industries": "जैसे ABC Industries", "10-digit number": "10 अंकों का नंबर", "Type your area": "अपना क्षेत्र लिखें", "Skills, dress code, food, transport…": "कौशल, ड्रेस कोड, भोजन, परिवहन…", "Your area / உங்கள் பகுதி": "आपका क्षेत्र", "Languages, skills, preferred area...": "भाषाएँ, कौशल, पसंदीदा क्षेत्र...", "Please choose an option": "कृपया एक विकल्प चुनें", "Please fill this in": "कृपया इसे भरें", "Please enter your full name": "कृपया अपना पूरा नाम लिखें", "Letters only — no numbers or symbols": "केवल अक्षर — संख्या या चिन्ह नहीं", "Digits only — no spaces or dashes": "केवल अंक — स्पेस या डैश नहीं", "Enter exactly 10 digits": "ठीक 10 अंक दर्ज करें", "Indian numbers start with 6, 7, 8 or 9": "भारतीय मोबाइल नंबर 6, 7, 8 या 9 से शुरू होते हैं", "Please pick today or a later date": "आज या बाद की तारीख चुनें", "Please tick this to continue": "जारी रखने के लिए इसे चुनें"} };
  var currentLang = "en";
  var i18nTextNodes = [];
  var i18nAttrNodes = [];

  function tr(text) {
    var dict = I18N[currentLang] || {};
    return dict[text] || text;
  }

  function captureI18n(root) {
    root = root || document.body;
    if (!root) return;

    $$("option", root).forEach(function (opt) {
      if (!opt.hasAttribute("value")) opt.setAttribute("value", opt.textContent.trim());
    });

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (/^(SCRIPT|STYLE|NOSCRIPT|SVG)$/.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest && parent.closest(".lang-btn")) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var node;
    while ((node = walker.nextNode())) {
      if (node.__surukoI18nCaptured) continue;
      node.__surukoI18nCaptured = true;
      node.__surukoI18nSource = node.nodeValue.trim();
      i18nTextNodes.push(node);
    }

    $$("[placeholder]", root).forEach(function (el) {
      if (el.__surukoPlaceholderCaptured) return;
      el.__surukoPlaceholderCaptured = true;
      el.__surukoPlaceholderSource = el.getAttribute("placeholder") || "";
      i18nAttrNodes.push(el);
    });
  }

  function applyLanguage(lang) {
    currentLang = I18N[lang] ? lang : "en";
    var dict = I18N[currentLang] || {};
    document.documentElement.lang = currentLang === "ta" ? "ta-IN" : currentLang === "hi" ? "hi-IN" : "en-IN";

    i18nTextNodes.forEach(function (node) {
      var source = node.__surukoI18nSource || "";
      var raw = node.nodeValue;
      var lead = (raw.match(/^\s*/) || [""])[0];
      var trail = (raw.match(/\s*$/) || [""])[0];
      node.nodeValue = lead + (dict[source] || source) + trail;
    });
    i18nAttrNodes.forEach(function (el) {
      var source = el.__surukoPlaceholderSource || "";
      el.setAttribute("placeholder", dict[source] || source);
    });

    $$("[data-lang]").forEach(function (btn) {
      var active = btn.dataset.lang === currentLang;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });

    try { localStorage.setItem("suruko_language", currentLang); } catch (_) {}
    updateEstimator();
  }

  captureI18n(document.body);
  $$("[data-lang]").forEach(function (btn) {
    btn.addEventListener("click", function () { applyLanguage(btn.dataset.lang); });
  });
  var savedLang = "en";
  try { savedLang = localStorage.getItem("suruko_language") || "en"; } catch (_) {}

  /* ═══════════════════════════════════════════════════════════════
     v10 — Price estimator
  ═══════════════════════════════════════════════════════════════ */
  var estimator = $("#priceEstimator");
  var estService = $("#est-service");
  var helperCountEl = $("#helperCount");
  var rateLabelEl = $("#rateLabel");
  var rateValueEl = $("#rateValue");
  var helperMultiplierEl = $("#helperMultiplier");
  var estimatedCostEl = $("#estimatedCost");
  var estimatorBook = $("#estimatorBook");
  /* Duration → rate map (kept in sync with HTML data-price attrs) */
  var RATE_MAP = { 2: 299, 3: 349, 4: 549, 5: 649, 8: 999 };
  var selectedHours = 2;
  var selectedRate = 299;
  var helperCount = 1;
  var lastEstimatorFocus = null;

  function money(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
  function durationText(hours) {
    if (hours === 2) return currentLang === "ta" ? "2 மணி நேரம் வரை" : currentLang === "hi" ? "2 घंटे तक" : "up to 2 hrs";
    return currentLang === "ta" ? hours + " மணி" : currentLang === "hi" ? hours + " घंटे" : hours + " hrs";
  }
  function bookText(count) {
    if (currentLang === "ta") return count + " உதவியாளர்" + (count > 1 ? "களை" : "ை") + " இப்போது பதிவு செய்யுங்கள்";
    if (currentLang === "hi") return "अभी " + count + " सहायक" + (count > 1 ? "ों" : "") + " बुक करें";
    return "Book " + count + " Helper" + (count === 1 ? "" : "s") + " Now";
  }
  function updateEstimator() {
    if (!helperCountEl) return;
    helperCountEl.textContent = String(helperCount);
    if (rateLabelEl) {
      if (currentLang === "ta") rateLabelEl.textContent = "ஒரு உதவியாளருக்கான கட்டணம் (" + durationText(selectedHours) + ")";
      else if (currentLang === "hi") rateLabelEl.textContent = "प्रति सहायक दर (" + durationText(selectedHours) + ")";
      else rateLabelEl.textContent = "Rate per helper (" + durationText(selectedHours) + ")";
    }
    if (rateValueEl) rateValueEl.textContent = money(selectedRate);
    if (helperMultiplierEl) helperMultiplierEl.textContent = "× " + helperCount;
    if (estimatedCostEl) estimatedCostEl.textContent = money(selectedRate * helperCount);
    if (estimatorBook) estimatorBook.textContent = bookText(helperCount);
  }

  function openEstimator(trigger) {
    if (!estimator) return;
    lastEstimatorFocus = trigger || document.activeElement;
    estimator.hidden = false;
    estimator.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    var menu = $("#mobileMenu");
    if (menu && !menu.hidden) { menu.hidden = true; if (navToggle) navToggle.setAttribute("aria-expanded", "false"); }
    setTimeout(function () { var c = $(".estimator-close", estimator); if (c) c.focus(); }, 0);
  }
  function closeEstimator() {
    if (!estimator) return;
    estimator.hidden = true;
    estimator.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (lastEstimatorFocus && lastEstimatorFocus.focus) lastEstimatorFocus.focus();
  }

  $$("[data-open-estimator]").forEach(function (btn) {
    btn.addEventListener("click", function () { openEstimator(btn); });
  });
  $$("[data-close-estimator]").forEach(function (btn) {
    btn.addEventListener("click", closeEstimator);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && estimator && !estimator.hidden) closeEstimator();
  });

  $$(".duration-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectedHours = Number(btn.dataset.hours || 2);
      selectedRate = RATE_MAP[selectedHours] || Number(btn.dataset.price || 299);
      $$(".duration-btn").forEach(function (b) {
        var active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      updateEstimator();
    });
  });
  var helperMinus = $("#helperMinus"), helperPlus = $("#helperPlus");
  if (helperMinus) helperMinus.addEventListener("click", function () { helperCount = Math.max(1, helperCount - 1); updateEstimator(); });
  if (helperPlus) helperPlus.addEventListener("click", function () { helperCount = Math.min(50, helperCount + 1); updateEstimator(); });

  if (estimatorBook) estimatorBook.addEventListener("click", function () {
    var workType    = $("#b-wt");
    var headcount   = $("#b-hc");
    var duration    = $("#b-duration");
    var shiftSel    = $("#b-sh");      /* TASK 06 — shift timing field */
    var paySel      = $("#b-pay");     /* TASK 07 — pay per person field */
    var estimateInput = $("#b-estimated-cost");

    /* Pre-fill work type from estimator service selector */
    if (workType && estService && estService.value) workType.value = estService.value;

    /* Pre-fill worker count (TASK 02 fix — add option if not in list) */
    if (headcount) {
      var helperValue = String(helperCount);
      var hasHelperOption = Array.prototype.some.call(headcount.options, function (opt) { return opt.value === helperValue; });
      if (!hasHelperOption) {
        var helperOption = document.createElement("option");
        helperOption.value = helperValue;
        helperOption.textContent = helperValue;
        headcount.appendChild(helperOption);
      }
      headcount.value = helperValue;
    }

    /* Pre-fill booking duration */
    if (duration) duration.value = selectedHours === 2 ? "Up to 2 hours" : selectedHours + " hours";

    /* TASK 06 — Pre-fill shift timing based on duration chosen in estimator */
    if (shiftSel) {
      if (selectedHours <= 2) {
        shiftSel.value = "Flexible";
      } else if (selectedHours <= 5) {
        shiftSel.value = "Day — 9 AM to 6 PM";
      } else {
        /* 8 hr — full day */
        shiftSel.value = "Full day";
      }
    }

    /* TASK 07 — Pre-fill pay per person based on estimator rate */
    if (paySel) {
      var rate = selectedRate;
      /* Map estimator per-helper rate to pay-range option that best fits */
      if (rate <= 299)       paySel.value = "Under ₹500/day";
      else if (rate <= 499)  paySel.value = "Under ₹500/day";
      else if (rate <= 700)  paySel.value = "₹500–₹700/day";
      else if (rate <= 900)  paySel.value = "₹700–₹900/day";
      else if (rate <= 1200) paySel.value = "₹900–₹1,200/day";
      else if (rate <= 1500) paySel.value = "₹1,200–₹1,500/day";
      else                   paySel.value = "Above ₹1,500/day";
    }

    /* Store estimated total as hidden field */
    if (estimateInput) estimateInput.value = String(selectedRate * helperCount);

    closeEstimator();

    /* TASK 02 — Always scroll to the business form section */
    activateTab("business", false);
    setTimeout(function () {
      var sec = $("#start");
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(function () { if (duration) duration.focus({ preventScroll: true }); }, 200);
    }, 100);

    var msg = currentLang === "ta"
      ? "மதிப்பீட்டு விவரங்கள் உங்கள் கோரிக்கையில் சேர்க்கப்பட்டன."
      : currentLang === "hi"
        ? "अनुमान की जानकारी आपके अनुरोध में जोड़ दी गई है."
        : "Estimator details added — form is ready for you.";
    showToast(msg, false, 4200);
  });

  [$("#b-duration"), $("#b-hc"), $("#b-wt")].forEach(function (el) {
    if (!el) return;
    el.addEventListener("change", function (e) {
      if (e.isTrusted) { var estimateInput = $("#b-estimated-cost"); if (estimateInput) estimateInput.value = ""; }
    });
  });

  applyLanguage(savedLang);

  /* ── Boot ────────────────────────────────────────────────────── */
  flushQueue();

})();
