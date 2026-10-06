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
    weather: must("weather"),
    insight: must("insight"),
    brief: must("brief"),
    opinion: must("opinion"),
    question: must("question"),
    answer: must("answer"),
    connect: must("connect"),
    connectBtn: must("btn-connect")
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

  function paintWeather(day) {
    var weather = day && day.weather && typeof day.weather === "object" ? day.weather : null;
    var summary = weather ? asText(weather.summary).trim() : "";
    var line;
    els.weather.textContent = "";
    if (!summary) {
      els.weather.appendChild(node("div", "muted", "No weather yet."));
      return;
    }
    line = summary;
    if (Number.isFinite(weather.hiC) && Number.isFinite(weather.loC)) {
      line += " " + weather.hiC + "° / " + weather.loC + "°";
    }
    if (Number.isFinite(weather.rainMm)) line += " · " + weather.rainMm + " mm";
    els.weather.textContent = line;
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
    els.day.textContent = label == null ? "" : String(label);
    paintWeather(day);
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
    if (!answerFocused()) render();
  }

  function hasToken() {
    try {
      var cfg = JSON.parse(localStorage.getItem("dong-gh-sync") || "null");
      return !!(cfg && cfg.token);
    } catch (e) {
      return false;
    }
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

  function showToday() {
    var key = readKey();
    if (!key) {
      location.replace("#" + MirrorCore.todayKey(new Date()));
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
    location.hash = "#" + MirrorCore.todayKey(new Date());
  });
  els.connectBtn.addEventListener("click", function () {
    GhSync.load("mirror", mergeIn).then(function () {
      showConnect();
      els.sync.textContent = "☁️ Synced " + hhmm();
    }, fail);
  });
  window.addEventListener("hashchange", function () {
    stopSpeech();
    showToday();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && saveTimer) pushNow();
    if (document.visibilityState === "visible") autoLoad();
  });

  if (window.speechSynthesis) window.speechSynthesis.getVoices();
  showToday();
  setInterval(autoLoad, 60000);
  autoLoad();
})();
