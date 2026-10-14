(function () {
  "use strict";

  var STORE_KEY = "mirror-v1";
  var SAVE_DELAY = 2500;

  if (
    !window.MirrorCore ||
    typeof MirrorCore.blankStore !== "function" ||
    typeof MirrorCore.mergeStores !== "function" ||
    typeof MirrorCore.todayKey !== "function" ||
    typeof MirrorCore.shift !== "function" ||
    typeof MirrorCore.label !== "function"
  ) {
    throw new Error("MirrorCore is not loaded");
  }
  if (typeof MirrorCore.skyOf !== "function") throw new Error("MirrorCore.skyOf is not loaded");
  if (typeof MirrorCore.sleepStat !== "function") throw new Error("MirrorCore.sleepStat is not loaded");
  if (typeof MirrorCore.weightStat !== "function") throw new Error("MirrorCore.weightStat is not loaded");
  if (typeof MirrorCore.nextLift !== "function") throw new Error("MirrorCore.nextLift is not loaded");
  if (typeof MirrorCore.moodStat !== "function") throw new Error("MirrorCore.moodStat is not loaded");
  if (typeof MirrorCore.minutes !== "function") throw new Error("MirrorCore.minutes is not loaded");
  if (typeof MirrorCore.lisbonToday !== "function") throw new Error("MirrorCore.lisbonToday is not loaded");
  if (typeof MirrorCore.moodQuadrants !== "function") throw new Error("MirrorCore.moodQuadrants is not loaded");
  if (typeof MirrorCore.applyJournalCheckin !== "function") throw new Error("MirrorCore.applyJournalCheckin is not loaded");
  if (typeof MirrorCore.jsonIndent !== "function") throw new Error("MirrorCore.jsonIndent is not loaded");
  if (!window.GhSync || typeof GhSync.save !== "function" || typeof GhSync.load !== "function") {
    throw new Error("GhSync is not loaded");
  }

  function must(id) {
    var el = document.getElementById(id);
    if (!el) throw new Error("Missing required element #" + id);
    return el;
  }

  var els = {
    sync: must("sync-label"),
    day: must("day-label"),
    prev: must("prev"),
    today: must("today"),
    next: must("next"),
    hero: must("hero"),
    skySummary: must("sky-summary"),
    hi: must("hi"),
    lo: must("lo"),
    stats: must("stats"),
    insight: must("insight"),
    brief: must("brief"),
    opinion: must("opinion"),
    question: must("question"),
    answer: must("answer"),
    connect: must("connect"),
    connectBtn: must("btn-connect"),
    top3: must("top3"),
    sunlight: must("sunlight"),
    lift: must("lift")
  };

  var store = readStore();
  var cur = "";
  var paintedKey = "";
  var loading = false;
  var saving = false;
  var saveAgain = false;
  var saveTimer = null;
  var retried = false;
  var speechGen = 0;
  var speechLabel = "Play";
  var side = { journal: null, nutrition: null, streetlifting: null };
  var CHECKIN_KEY = "mirror-checkin-v1";
  var JOURNAL_REPO = "Dong-Xuyong/progress-sync";
  var pending = {};
  var pendingDay = "";
  var journalTimer = null;
  var journalSaving = false;
  var journalAgain = false;
  var journalEpoch = 0;

  function readStore() {
    try {
      var data = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (data && data.version === 1 && data.days && typeof data.days === "object" && !Array.isArray(data.days)) {
        return data;
      }
    } catch (e) {}
    return MirrorCore.blankStore();
  }

  function persist() {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }

  function node(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function hhmm() {
    var now = new Date();
    return String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  }

  function readKey() {
    var hash = location.hash.charAt(0) === "#" ? location.hash.slice(1) : "";
    if (!hash) return "";
    try {
      hash = decodeURIComponent(hash);
    } catch (e) {
      return "";
    }
    try {
      MirrorCore.label(hash);
    } catch (e2) {
      return "";
    }
    return hash;
  }

  function dayOf(key) {
    if (!store || !store.days || typeof store.days !== "object") return null;
    var day = store.days[key];
    return day && typeof day === "object" ? day : null;
  }

  function ensureDay(key) {
    if (!store.days || typeof store.days !== "object") store.days = {};
    if (!store.days[key] || typeof store.days[key] !== "object") {
      store.days[key] = { updatedAt: "", answer: { text: "", updatedAt: "" } };
    }
    var day = store.days[key];
    if (!day.answer || typeof day.answer !== "object") day.answer = { text: "", updatedAt: "" };
    return day;
  }

  function asText(value) {
    return typeof value === "string" ? value : "";
  }

  function briefString(day) {
    return day ? asText(day.brief) : "";
  }

  function answerString(day) {
    if (!day || !day.answer || typeof day.answer !== "object") return "";
    return asText(day.answer.text);
  }

  function answerFocused() {
    var area = document.getElementById("answer-text");
    return !!(area && document.activeElement === area);
  }

  function paintPlain(el, value) {
    var text = asText(value);
    el.textContent = "";
    if (text.trim()) el.textContent = text;
    else el.appendChild(node("div", "muted", "\u00a0"));
  }

  function ringPct(hours, target) {
    var p;
    if (typeof target !== "number") return 0;
    p = (hours / target) * 100;
    if (!isFinite(p) || p < 0) return 0;
    if (p > 100) return 100;
    return p;
  }

  function dots(count, title) {
    var wrap = node("div", "dots");
    var i;
    wrap.title = title;
    for (i = 0; i < 5; i++) wrap.appendChild(node("span", i < count ? "dot on" : "dot"));
    return wrap;
  }

  function statTile(k, v, s) {
    var el = node("div", "tile");
    var value = node("div", "v");
    el.appendChild(node("div", "k", k));
    if (v && v.nodeType) value.appendChild(v);
    else value.textContent = v == null ? "" : String(v);
    el.appendChild(value);
    el.appendChild(node("div", "s", s == null ? "" : String(s)));
    return el;
  }

  function lisbonDay() {
    return MirrorCore.lisbonToday(new Date());
  }

  function viewingToday(key) {
    return key === lisbonDay();
  }

  function plainObj(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function journalDay(key) {
    var days = side.journal && side.journal.days;
    var day;
    if (!plainObj(days)) return null;
    day = days[key];
    return plainObj(day) ? day : null;
  }

  function hhmmOk(value) {
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  function top3Focused() {
    var el = document.activeElement;
    if (!el || !el.id) return false;
    return el.id.indexOf("top3-text-") === 0 || el.id.indexOf("top3-done-") === 0;
  }

  function wakeFocused() {
    var el = document.getElementById("wake-time");
    return !!(el && document.activeElement === el);
  }

  function canRender() {
    return !answerFocused() && !top3Focused() && !wakeFocused();
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadPending() {
    var data;
    var today = lisbonDay();
    pending = {};
    pendingDay = today;
    try {
      data = JSON.parse(localStorage.getItem(CHECKIN_KEY) || "null");
    } catch (e) {
      data = null;
    }
    if (data && data.day === today && plainObj(data.patch)) {
      pending = data.patch;
      pendingDay = today;
    } else if (data) {
      localStorage.removeItem(CHECKIN_KEY);
    }
  }

  function storePending() {
    if (!Object.keys(pending).length) {
      localStorage.removeItem(CHECKIN_KEY);
      return;
    }
    localStorage.setItem(CHECKIN_KEY, JSON.stringify({ day: pendingDay || lisbonDay(), patch: pending }));
  }

  function ownsPending(field) {
    return viewingToday(cur) && pendingDay === lisbonDay() && Object.prototype.hasOwnProperty.call(pending, field);
  }

  function slotsFrom(list) {
    var slots = [
      { text: "", done: false },
      { text: "", done: false },
      { text: "", done: false }
    ];
    var i;
    var item;
    var n = 0;
    if (!Array.isArray(list)) return slots;
    for (i = 0; i < list.length && n < 3; i++) {
      item = list[i];
      if (typeof item === "string") slots[n++] = { text: item, done: false };
      else if (plainObj(item) && typeof item.text === "string") slots[n++] = { text: item.text, done: item.done === true };
    }
    return slots;
  }

  function top3Source(key) {
    var saved;
    var mirrorDay;
    if (ownsPending("top3") && Array.isArray(pending.top3)) return pending.top3;
    saved = journalDay(key);
    if (saved && Array.isArray(saved.top3)) return saved.top3;
    mirrorDay = dayOf(key);
    if (mirrorDay && Array.isArray(mirrorDay.top3)) return mirrorDay.top3;
    return null;
  }

  function filledSlots(slots) {
    var out = [];
    var i;
    for (i = 0; i < slots.length; i++) {
      if (slots[i].text.trim() || slots[i].done) out.push(slots[i]);
    }
    return out;
  }

  function readTop3() {
    var out = [];
    var i;
    var textEl;
    var doneEl;
    for (i = 0; i < 3; i++) {
      textEl = document.getElementById("top3-text-" + i);
      doneEl = document.getElementById("top3-done-" + i);
      if (!textEl) continue;
      out.push({ text: textEl.value, done: !!(doneEl && doneEl.checked) });
    }
    return out;
  }

  function shownSleep(key) {
    var saved = journalDay(key);
    var base = saved && plainObj(saved.sleep) ? saved.sleep : {};
    var src = ownsPending("sleep") && plainObj(pending.sleep) ? pending.sleep : base;
    var out = {};
    if (src.hours === 5 || src.hours === 6 || src.hours === 7 || src.hours === 8 || src.hours === "9+") out.hours = src.hours;
    else if (typeof src.hours === "number" && src.hours >= 9) out.hours = "9+";
    if (src.quality === "poor" || src.quality === "ok" || src.quality === "good") out.quality = src.quality;
    if (hhmmOk(src.wake)) out.wake = src.wake;
    return out;
  }

  function hasJournalSleep(key) {
    var sleep = shownSleep(key);
    return sleep.hours != null || !!sleep.quality || !!sleep.wake;
  }

  function pickedQuadrant(key) {
    var saved;
    var q = "";
    if (ownsPending("moodMeter") && plainObj(pending.moodMeter)) q = pending.moodMeter.quadrant;
    else {
      saved = journalDay(key);
      q = saved && plainObj(saved.moodMeter) ? saved.moodMeter.quadrant : "";
    }
    return typeof q === "string" ? q : "";
  }

  function shownBool(key, name) {
    var saved;
    if (ownsPending(name)) {
      if (pending[name] === true) return true;
      if (pending[name] === false) return false;
      return null;
    }
    saved = journalDay(key);
    if (saved && typeof saved[name] === "boolean") return saved[name];
    return null;
  }

  function mirrorSun(day) {
    var sun = day && plainObj(day.sunCaffeine) ? day.sunCaffeine : null;
    var text = sun && typeof sun.text === "string" ? sun.text.trim() : "";
    var cutoff = sun && hhmmOk(sun.coffeeAfter) ? sun.coffeeAfter : "14:00";
    var wake = sun && hhmmOk(sun.wakeAssumed) ? sun.wakeAssumed : "";
    return { text: text, cutoff: cutoff, wake: wake };
  }

  function note(partial, delay) {
    var keys = Object.keys(partial);
    var i;
    var today = lisbonDay();
    if (pendingDay && pendingDay !== today) pending = {};
    pendingDay = today;
    for (i = 0; i < keys.length; i++) pending[keys[i]] = partial[keys[i]];
    storePending();
    if (!hasToken()) {
      els.sync.textContent = "Connect sync to save";
      showConnect();
      return;
    }
    if (!delay) pushJournal();
    else scheduleJournal(delay);
  }

  function paintTop3(key) {
    var editable = viewingToday(key);
    var slots = slotsFrom(top3Source(key));
    var shown = editable ? slots : filledSlots(slots);
    var i;
    var row;
    var box;
    var field;
    var heading;
    if (!editable && !shown.length) {
      els.top3.hidden = true;
      els.top3.textContent = "";
      return;
    }
    els.top3.hidden = false;
    if (top3Focused() && paintedKey === key) return;
    els.top3.textContent = "";
    heading = node("div", "kicker", "Top 3");
    heading.id = "top3-label";
    els.top3.setAttribute("aria-labelledby", "top3-label");
    els.top3.appendChild(heading);
    for (i = 0; i < (editable ? 3 : shown.length); i++) {
      row = node("div", "top3-row");
      box = document.createElement("input");
      box.type = "checkbox";
      box.id = "top3-done-" + i;
      box.checked = editable ? slots[i].done : shown[i].done;
      box.disabled = !editable;
      field = document.createElement("input");
      field.type = "text";
      field.id = "top3-text-" + i;
      field.maxLength = 280;
      field.autocomplete = "off";
      field.placeholder = "Priority";
      field.value = editable ? slots[i].text : shown[i].text;
      field.readOnly = !editable;
      if (!editable) field.disabled = true;
      row.appendChild(box);
      row.appendChild(field);
      els.top3.appendChild(row);
    }
    if (editable && !hasToken()) els.top3.appendChild(node("p", "hint", "Connect sync to save."));
  }

  function chipButton(label, attrs, pressed, disabled) {
    var btn = document.createElement("button");
    var key;
    btn.type = "button";
    btn.textContent = label;
    btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    btn.disabled = !!disabled;
    for (key in attrs) if (Object.prototype.hasOwnProperty.call(attrs, key)) btn.setAttribute(key, attrs[key]);
    return btn;
  }

  function sleepEditor(key, editable, nutrition) {
    var el = node("div", "tile wide");
    var sleep = shownSleep(key);
    var hours = [5, 6, 7, 8, "9+"];
    var qualities = [
      { id: "poor", label: "Poor" },
      { id: "ok", label: "Ok" },
      { id: "good", label: "Good" }
    ];
    var hourRow = node("div", "chips");
    var qualityRow = node("div", "chips");
    var wakeRow = node("label", "wake-row");
    var wake = document.createElement("input");
    var mirror = mirrorSun(dayOf(key));
    var notes = [];
    var i;
    el.appendChild(node("div", "k", "Sleep"));
    el.appendChild(node("div", "chip-label", "Hours"));
    hourRow.setAttribute("role", "group");
    hourRow.setAttribute("aria-label", "Hours slept");
    for (i = 0; i < hours.length; i++) {
      hourRow.appendChild(chipButton(String(hours[i]), { "data-hours": String(hours[i]) }, sleep.hours === hours[i], !editable));
    }
    el.appendChild(hourRow);
    el.appendChild(node("div", "chip-label", "Quality"));
    qualityRow.setAttribute("role", "group");
    qualityRow.setAttribute("aria-label", "Sleep quality");
    for (i = 0; i < qualities.length; i++) {
      qualityRow.appendChild(chipButton(qualities[i].label, { "data-quality": qualities[i].id }, sleep.quality === qualities[i].id, !editable));
    }
    el.appendChild(qualityRow);
    wake.type = "time";
    wake.id = "wake-time";
    wake.step = "60";
    wake.value = sleep.wake || "";
    wake.disabled = !editable;
    wake.setAttribute("aria-label", "Wake time, optional");
    wakeRow.appendChild(document.createTextNode("Wake"));
    wakeRow.appendChild(wake);
    el.appendChild(wakeRow);
    if (nutrition) {
      notes.push("Nutrition log: " + nutrition.hours + " h" + (typeof nutrition.target === "number" ? " of " + nutrition.target : ""));
    }
    if (mirror.wake && !sleep.wake) notes.push("Assumed wake " + mirror.wake);
    if (notes.length) el.appendChild(node("div", "s", notes.join(" \u00b7 ")));
    return el;
  }

  function legacySleepTile(sleep) {
    var sleepEl = statTile(
      "Sleep",
      sleep ? sleep.hours + " h" : "\u2014",
      sleep ? (typeof sleep.target === "number" ? "of " + sleep.target + " h" : "") : "not logged"
    );
    var ring = node("div", "ring");
    if (sleep) {
      ring.style.setProperty("--p", String(ringPct(sleep.hours, sleep.target)));
      sleepEl.appendChild(ring);
    }
    return sleepEl;
  }

  function moodEditor(key, editable, logged) {
    var el = node("div", "tile wide");
    var grid = node("div", "meter");
    var selected = pickedQuadrant(key);
    var list = MirrorCore.moodQuadrants();
    var i;
    var spec;
    var btn;
    var name;
    var label;
    var hint = "High energy on top. Pleasant on the right.";
    if (!selected && logged && logged.date === key && typeof logged.mood === "number") {
      hint = "Logged mood " + logged.mood + (typeof logged.energy === "number" ? ", energy " + logged.energy : "") + ". " + hint;
    }
    el.appendChild(node("div", "k", "Mood"));
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Mood meter");
    for (i = 0; i < list.length; i++) {
      spec = list[i];
      btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-quadrant", spec.id);
      btn.setAttribute("aria-pressed", selected === spec.id ? "true" : "false");
      btn.setAttribute(
        "aria-label",
        spec.name + ", " + spec.label + ", " + spec.energy + " energy, " + spec.pleasantness + " pleasantness"
      );
      btn.disabled = !editable;
      name = node("span", "meter-name", spec.name);
      label = node("span", "meter-label", spec.label);
      btn.appendChild(name);
      btn.appendChild(label);
      grid.appendChild(btn);
    }
    el.appendChild(grid);
    el.appendChild(node("div", "s", hint));
    return el;
  }

  function legacyMoodTile(mood) {
    var moodBox;
    if (!mood) return statTile("Mood", "\u2014", "not logged");
    moodBox = document.createDocumentFragment();
    moodBox.appendChild(dots(mood.mood, "Mood"));
    if (typeof mood.energy === "number" && isFinite(mood.energy)) moodBox.appendChild(dots(mood.energy, "Energy"));
    return statTile("Mood", moodBox, mood.date == null ? "" : String(mood.date));
  }

  function paintStats(key) {
    var nutrition = MirrorCore.sleepStat(side.nutrition, key);
    var weight = MirrorCore.weightStat(side.nutrition, key);
    var lift = MirrorCore.nextLift(side.streetlifting);
    var mood = MirrorCore.moodStat(side.journal, key);
    var editable = viewingToday(key);
    var delta = "";
    var liftLabel = "";
    var liftDetail = "";
    if (wakeFocused()) {
      var selectedNow = pickedQuadrant(key);
      var quadrantButtons = els.stats.querySelectorAll("[data-quadrant]");
      var qi;
      for (qi = 0; qi < quadrantButtons.length; qi++) {
        quadrantButtons[qi].setAttribute(
          "aria-pressed",
          quadrantButtons[qi].getAttribute("data-quadrant") === selectedNow ? "true" : "false"
        );
      }
      return;
    }
    els.stats.textContent = "";
    if (editable || hasJournalSleep(key)) els.stats.appendChild(sleepEditor(key, editable, nutrition));
    else els.stats.appendChild(legacySleepTile(nutrition));
    if (!weight) {
      els.stats.appendChild(statTile("Weight", "\u2014", "not logged"));
    } else {
      if (typeof weight.delta === "number" && isFinite(weight.delta)) {
        delta = (weight.delta > 0 ? "+" : "") + weight.delta.toFixed(1) + " kg vs goal";
      }
      els.stats.appendChild(statTile("Weight", weight.kg + " kg", delta));
    }
    if (!lift) {
      els.stats.appendChild(statTile("Next lift", "\u2014", "not logged"));
    } else {
      liftLabel = lift.label ? String(lift.label) : "";
      liftDetail = lift.detail ? String(lift.detail) : "";
      els.stats.appendChild(statTile(
        "Next lift",
        lift.name == null ? "" : String(lift.name),
        liftLabel && liftDetail ? liftLabel + " \u00b7 " + liftDetail : liftLabel || liftDetail
      ));
    }
    if (editable || pickedQuadrant(key)) els.stats.appendChild(moodEditor(key, editable, mood));
    else els.stats.appendChild(legacyMoodTile(mood));
  }

  function paintSunlight(key, day) {
    var editable = viewingToday(key);
    var sun = mirrorSun(day);
    var line = sun.text || (editable ? "Morning sunlight. No caffeine after 14:00." : "");
    var sunlight = shownBool(key, "sunlight");
    var caffeine = shownBool(key, "caffeine");
    var row;
    if (!editable && !line && sunlight === null && caffeine === null) {
      els.sunlight.hidden = true;
      els.sunlight.textContent = "";
      return;
    }
    els.sunlight.hidden = false;
    els.sunlight.textContent = "";
    if (line) els.sunlight.appendChild(node("p", "sun-text", line));
    row = node("div", "chips");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Sunlight and caffeine");
    row.appendChild(chipButton("Sunlight yes", { "data-sunlight": "yes" }, sunlight === true, !editable));
    row.appendChild(chipButton("Sunlight no", { "data-sunlight": "no" }, sunlight === false, !editable));
    row.appendChild(chipButton("No caffeine after " + sun.cutoff, { "data-caffeine": "1" }, caffeine === true, !editable));
    els.sunlight.appendChild(row);
  }

  function paintLift(day) {
    var lift = day && plainObj(day.liftWalkthrough) ? day.liftWalkthrough : null;
    var text = lift && typeof lift.text === "string" ? lift.text.trim() : "";
    var name = lift && typeof lift.lift === "string" ? lift.lift.trim() : "";
    var details;
    var summary;
    var body;
    var open = false;
    var prev;
    if (!text) {
      els.lift.hidden = true;
      els.lift.textContent = "";
      return;
    }
    prev = els.lift.querySelector("details");
    open = !!(prev && prev.open);
    els.lift.hidden = false;
    els.lift.textContent = "";
    details = document.createElement("details");
    if (open) details.open = true;
    summary = document.createElement("summary");
    summary.textContent = name || "Lift";
    body = document.createElement("p");
    body.textContent = text;
    details.appendChild(summary);
    details.appendChild(body);
    els.lift.appendChild(details);
  }

  function paintInsight(day) {
    var insight = day && day.insight && typeof day.insight === "object" ? day.insight : null;
    var slug = insight ? asText(insight.slug).trim() : "";
    var link;
    var why;
    els.insight.textContent = "";
    if (!slug) {
      els.insight.appendChild(node("div", "muted", "No insight yet."));
      return;
    }
    link = document.createElement("a");
    link.href = "https://dong-xuyong.github.io/wiki-flashcards/#/c/" + encodeURIComponent(slug);
    link.textContent = insight ? asText(insight.title) : "";
    why = document.createElement("div");
    why.textContent = insight ? asText(insight.why) : "";
    els.insight.appendChild(link);
    els.insight.appendChild(why);
  }

  function paintBrief(day) {
    var brief = briefString(day);
    var has = brief.trim() !== "";
    var btn = document.createElement("button");
    var text = document.createElement("div");
    els.brief.textContent = "";
    btn.type = "button";
    btn.id = "play";
    btn.textContent = has ? speechLabel : "Play";
    btn.disabled = !has;
    btn.addEventListener("click", onPlay);
    text.id = "brief-text";
    if (has) text.textContent = brief;
    else {
      text.className = "muted";
      text.textContent = "No brief yet. Grok writes this at 07:00.";
    }
    els.brief.appendChild(btn);
    if (has) els.brief.appendChild(node("span", "mins", "about " + MirrorCore.minutes(brief) + " min"));
    els.brief.appendChild(text);
  }

  function paintAnswer(day) {
    var area = document.getElementById("answer-text");
    var label;
    var text = answerString(day);
    if (area && document.activeElement === area && paintedKey === cur) return;
    els.answer.textContent = "";
    label = document.createElement("label");
    label.htmlFor = "answer-text";
    label.textContent = "Your answer";
    area = document.createElement("textarea");
    area.id = "answer-text";
    area.addEventListener("input", onAnswer);
    if (document.activeElement !== area) area.value = text;
    els.answer.appendChild(label);
    els.answer.appendChild(area);
    paintedKey = cur;
  }

  function render() {
    var day = dayOf(cur);
    var label = MirrorCore.label(cur);
    var isToday = viewingToday(cur);
    var sky = MirrorCore.skyOf(day && day.weather, new Date().getHours(), isToday);
    var weather = day && day.weather && typeof day.weather === "object" ? day.weather : null;
    var summary = weather ? asText(weather.summary).trim() : "";
    els.day.textContent = label == null ? "" : String(label);
    els.hero.setAttribute("data-sky", sky.sky);
    els.hero.setAttribute("data-time", sky.time);
    els.hi.textContent = weather && Number.isFinite(weather.hiC) ? weather.hiC + "\u00b0" : "\u2014";
    els.lo.textContent = weather && Number.isFinite(weather.loC) ? weather.loC + "\u00b0" : "";
    els.skySummary.textContent = summary || "No weather yet.";
    paintTop3(cur);
    paintStats(cur);
    paintSunlight(cur, day);
    paintLift(day);
    paintInsight(day);
    paintBrief(day);
    paintPlain(els.opinion, day ? day.opinion : "");
    paintPlain(els.question, day ? day.question : "");
    paintAnswer(day);
  }

  function onAnswer() {
    var area = document.getElementById("answer-text");
    var day;
    if (!area || !cur) return;
    day = ensureDay(cur);
    day.answer.text = area.value;
    day.answer.updatedAt = new Date().toISOString();
    persist();
    scheduleSave();
  }

  function englishVoice() {
    var synth = window.speechSynthesis;
    var list = synth ? synth.getVoices() : [];
    var i;
    var lang;
    for (i = 0; i < list.length; i++) {
      lang = list[i] && list[i].lang ? String(list[i].lang) : "";
      if (lang.toLowerCase().indexOf("en") === 0) return list[i];
    }
    return null;
  }

  function rememberLabel(label) {
    speechLabel = label;
    var btn = document.getElementById("play");
    if (btn) btn.textContent = label;
  }

  function finishSpeech(gen) {
    if (gen !== speechGen) return;
    rememberLabel("Play");
  }

  function stopSpeech() {
    speechGen += 1;
    speechLabel = "Play";
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  function startSpeech(text) {
    var synth = window.speechSynthesis;
    var utt;
    var voice;
    var gen;
    var delay;
    if (!synth || !text || !text.trim()) return;
    delay = !!(synth.speaking || synth.paused);
    gen = ++speechGen;
    synth.cancel();
    utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.0;
    voice = englishVoice();
    if (voice) {
      utt.voice = voice;
      utt.lang = voice.lang;
    }
    utt.onend = function () { finishSpeech(gen); };
    utt.onerror = function () { finishSpeech(gen); };
    function say() {
      if (gen !== speechGen) return;
      rememberLabel("Pause");
      synth.speak(utt);
    }
    if (delay) window.setTimeout(say, 50);
    else say();
  }

  function onPlay() {
    var synth = window.speechSynthesis;
    var text = briefString(dayOf(cur));
    if (!synth || !text.trim()) return;
    if (speechLabel === "Resume") {
      synth.resume();
      rememberLabel("Pause");
      return;
    }
    if (speechLabel === "Pause") {
      synth.pause();
      rememberLabel("Resume");
      return;
    }
    startSpeech(text);
  }

  function mergeIn(remote) {
    store = MirrorCore.mergeStores(store, remote);
    persist();
    if (canRender()) render();
  }

  function hasToken() {
    try {
      var cfg = JSON.parse(localStorage.getItem("dong-gh-sync") || "null");
      return !!(cfg && cfg.token);
    } catch (e) {
      return false;
    }
  }

  function loadSides() {
    var epoch = journalEpoch;
    if (!hasToken()) return;
    ["journal", "nutrition", "streetlifting"].forEach(function (id) {
      GhSync.load(id, function (data) {
        if (id === "journal" && epoch !== journalEpoch) return;
        side[id] = data;
        if (canRender()) render();
      }).then(function () {}, function () {});
    });
  }

  function showConnect() {
    els.connect.hidden = hasToken();
  }

  function fail(err) {
    els.sync.textContent = "⚠️ " + (err && err.message ? err.message : String(err));
    showConnect();
  }

  function scheduleSave() {
    if (!hasToken()) {
      els.sync.textContent = "Saved on this device";
      return;
    }
    els.sync.textContent = "✏️ Saving soon…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushNow, SAVE_DELAY);
  }

  function pushNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (saving) {
      saveAgain = true;
      return;
    }
    saving = true;
    els.sync.textContent = "☁️ Saving…";
    GhSync.save("mirror", function () { return store; }, mergeIn, { quiet: true }).then(function () {
      saving = false;
      retried = false;
      els.sync.textContent = "✅ Saved " + hhmm();
      if (saveAgain) {
        saveAgain = false;
        pushNow();
      }
    }, function (err) {
      saving = false;
      fail(err);
      if (!retried && /another device/.test(String(err && err.message))) {
        retried = true;
        saveTimer = setTimeout(pushNow, 3000);
      }
    });
  }

  function autoLoad() {
    showConnect();
    if (!hasToken()) {
      els.sync.textContent = "Not synced";
      return;
    }
    if (loading || saving || saveTimer) return;
    loading = true;
    GhSync.load("mirror", mergeIn).then(function () {
      loading = false;
      els.sync.textContent = "☁️ Synced " + hhmm();
    }, function (err) {
      loading = false;
      fail(err);
    });
  }

  function readCfg() {
    var cfg;
    try {
      cfg = JSON.parse(localStorage.getItem("dong-gh-sync") || "null");
    } catch (e) {
      cfg = null;
    }
    if (!cfg || !cfg.token) return null;
    return {
      token: String(cfg.token),
      repo: typeof cfg.repo === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cfg.repo) ? cfg.repo : JOURNAL_REPO
    };
  }

  function toBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function fromBase64(b64) {
    return decodeURIComponent(escape(atob(String(b64).replace(/\s/g, ""))));
  }

  function ghRequest(cfg, method, path, body) {
    return fetch("https://api.github.com/repos/" + cfg.repo + "/contents/" + path, {
      method: method,
      cache: "no-store",
      headers: {
        Authorization: "Bearer " + cfg.token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      if (res.status === 401) {
        localStorage.removeItem("dong-gh-sync");
        throw new Error("GitHub token rejected; you will be asked for a new one");
      }
      if (res.status === 404 && method === "GET") return null;
      if (res.status === 409) throw new Error("Saved from another device meanwhile; try again");
      if (!res.ok) throw new Error("GitHub error " + res.status);
      return res.json();
    });
  }

  function fetchJournal(cfg) {
    return ghRequest(cfg, "GET", "journal.json").then(function (file) {
      var raw;
      if (!file) return null;
      raw = fromBase64(file.content);
      return { sha: file.sha, raw: raw, data: JSON.parse(raw) };
    });
  }

  function putMerged(cfg, remote, dayKey, patch) {
    var base = remote && remote.data ? remote.data : { version: 1 };
    var space;
    var text;
    var body;
    if (!plainObj(base)) throw new Error("journal.json is not an object");
    if (typeof base.version !== "number") base.version = 1;
    MirrorCore.applyJournalCheckin(base, dayKey, patch);
    space = remote && typeof remote.raw === "string" ? MirrorCore.jsonIndent(remote.raw) : 2;
    text = JSON.stringify(base, null, space);
    if (remote && typeof remote.raw === "string" && /\n$/.test(remote.raw)) text += "\n";
    body = { message: "Save journal check-in", content: toBase64(text) };
    if (remote && remote.sha) body.sha = remote.sha;
    return ghRequest(cfg, "PUT", "journal.json", body).then(function () { return base; });
  }

  function isConflict(err) {
    return !!(err && /another device/.test(String(err.message || err)));
  }

  function scheduleJournal(delay) {
    if (!hasToken()) {
      els.sync.textContent = "Connect sync to save";
      showConnect();
      return;
    }
    els.sync.textContent = "✏️ Saving soon…";
    clearTimeout(journalTimer);
    journalTimer = setTimeout(pushJournal, delay);
  }

  function clearSaved(snapshot) {
    var keys = Object.keys(snapshot);
    var i;
    var key;
    for (i = 0; i < keys.length; i++) {
      key = keys[i];
      if (JSON.stringify(pending[key]) === JSON.stringify(snapshot[key])) delete pending[key];
    }
    storePending();
  }

  function pushJournal() {
    var cfg;
    var patch;
    var dayKey;
    var epoch;
    clearTimeout(journalTimer);
    journalTimer = null;
    if (pendingDay && pendingDay !== lisbonDay()) {
      pending = {};
      pendingDay = lisbonDay();
      storePending();
    }
    if (!Object.keys(pending).length) return;
    if (!hasToken()) {
      els.sync.textContent = "Connect sync to save";
      showConnect();
      return;
    }
    if (journalSaving) {
      journalAgain = true;
      return;
    }
    cfg = readCfg();
    if (!cfg) {
      els.sync.textContent = "Connect sync to save";
      showConnect();
      return;
    }
    journalSaving = true;
    epoch = ++journalEpoch;
    patch = cloneJson(pending);
    dayKey = lisbonDay();
    els.sync.textContent = "☁️ Saving…";
    fetchJournal(cfg).then(function (remote) {
      return putMerged(cfg, remote, dayKey, patch).catch(function (err) {
        if (!isConflict(err)) throw err;
        return fetchJournal(cfg).then(function (fresh) {
          return putMerged(cfg, fresh, dayKey, patch);
        });
      });
    }).then(function (merged) {
      journalSaving = false;
      if (epoch === journalEpoch) {
        side.journal = merged;
        journalEpoch++;
      }
      clearSaved(patch);
      els.sync.textContent = "✅ Saved " + hhmm();
      showConnect();
      if (journalAgain || Object.keys(pending).length) {
        journalAgain = false;
        pushJournal();
      } else if (canRender()) render();
    }, function (err) {
      journalSaving = false;
      journalAgain = false;
      fail(err);
    });
  }

  function onTop3Edit() {
    if (!viewingToday(cur)) return;
    note({ top3: readTop3(), top3UpdatedAt: new Date().toISOString() }, 700);
  }

  function setMood(id) {
    var list = MirrorCore.moodQuadrants();
    var spec = null;
    var i;
    var now;
    if (!viewingToday(cur)) return;
    for (i = 0; i < list.length; i++) if (list[i].id === id) spec = list[i];
    if (!spec) return;
    now = new Date().toISOString();
    note({
      moodMeter: {
        quadrant: spec.id,
        energy: spec.energy,
        pleasantness: spec.pleasantness,
        updatedAt: now
      },
      mood: spec.mood,
      energy: spec.energyScore
    }, 0);
    render();
  }

  function setSleep(partial) {
    var sleep = shownSleep(cur);
    var key;
    if (!viewingToday(cur)) return;
    for (key in partial) {
      if (!Object.prototype.hasOwnProperty.call(partial, key)) continue;
      if (key === "wake" && !partial.wake) delete sleep.wake;
      else sleep[key] = partial[key];
    }
    sleep.updatedAt = new Date().toISOString();
    note({ sleep: sleep }, 0);
    render();
  }

  function setSunlight(value) {
    var current;
    if (!viewingToday(cur)) return;
    current = shownBool(cur, "sunlight");
    note({ sunlight: current === value ? null : value }, 0);
    render();
  }

  function setCaffeine() {
    var current;
    if (!viewingToday(cur)) return;
    current = shownBool(cur, "caffeine");
    note({ caffeine: current === true ? null : true }, 0);
    render();
  }

  function showToday() {
    var key = readKey();
    if (!key) {
      location.replace("#" + lisbonDay());
      return;
    }
    cur = key;
    render();
  }

  els.prev.addEventListener("click", function () {
    if (!cur) return;
    location.hash = "#" + MirrorCore.shift(cur, -1);
  });
  els.next.addEventListener("click", function () {
    if (!cur) return;
    location.hash = "#" + MirrorCore.shift(cur, 1);
  });
  els.today.addEventListener("click", function () {
    location.hash = "#" + lisbonDay();
  });
  els.connectBtn.addEventListener("click", function () {
    GhSync.load("mirror", mergeIn).then(function () {
      showConnect();
      els.sync.textContent = "☁️ Synced " + hhmm();
      loadSides();
      if (Object.keys(pending).length) pushJournal();
    }, fail);
  });
  els.top3.addEventListener("input", function (ev) {
    if (ev.target && ev.target.id && ev.target.id.indexOf("top3-text-") === 0) onTop3Edit();
  });
  els.top3.addEventListener("change", function (ev) {
    var id = ev.target && ev.target.id;
    if (id && (id.indexOf("top3-done-") === 0 || id.indexOf("top3-text-") === 0)) onTop3Edit();
  });
  els.stats.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest("button") : null;
    var hours;
    var quality;
    var quadrant;
    if (!btn || !els.stats.contains(btn) || btn.disabled) return;
    quadrant = btn.getAttribute("data-quadrant");
    hours = btn.getAttribute("data-hours");
    quality = btn.getAttribute("data-quality");
    if (quadrant) setMood(quadrant);
    else if (hours) setSleep({ hours: hours === "9+" ? "9+" : Number(hours) });
    else if (quality) setSleep({ quality: quality });
  });
  els.stats.addEventListener("change", function (ev) {
    var value;
    if (!ev.target || ev.target.id !== "wake-time") return;
    value = ev.target.value || "";
    if (value && !hhmmOk(value)) return;
    setSleep({ wake: value });
  });
  els.sunlight.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest("button") : null;
    if (!btn || btn.disabled) return;
    if (btn.getAttribute("data-sunlight") === "yes") setSunlight(true);
    else if (btn.getAttribute("data-sunlight") === "no") setSunlight(false);
    else if (btn.hasAttribute("data-caffeine")) setCaffeine();
  });
  window.addEventListener("hashchange", function () {
    stopSpeech();
    showToday();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      if (saveTimer) pushNow();
      if (journalTimer) pushJournal();
    }
    if (document.visibilityState === "visible") {
      autoLoad();
      loadSides();
    }
  });
  window.addEventListener("pagehide", function () {
    if (saveTimer) pushNow();
    if (journalTimer) pushJournal();
  });

  if (window.speechSynthesis) window.speechSynthesis.getVoices();
  loadPending();
  showToday();
  setInterval(autoLoad, 60000);
  autoLoad();
  loadSides();
  if (hasToken() && Object.keys(pending).length) pushJournal();
})();
