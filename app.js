(function () {
  "use strict";

  if (!window.MirrorCore) throw new Error("MirrorCore is not loaded");
  if (!window.GhSync) throw new Error("GhSync is not loaded");
  if (
    typeof MirrorCore.label !== "function" ||
    typeof MirrorCore.mergeStores !== "function" ||
    typeof MirrorCore.blankStore !== "function" ||
    typeof MirrorCore.minutes !== "function" ||
    typeof MirrorCore.lisbonToday !== "function"
  ) {
    throw new Error("MirrorCore is missing a function");
  }

  var STORE_KEY = "mirror-brief";
  var SUN_FALLBACK = "Morning sunlight. No caffeine after 14:00.";
  var els = {
    syncLabel: must("sync-label"),
    weather: must("weather"),
    sunlight: must("sunlight"),
    brief: must("brief"),
    play: must("play"),
    mins: must("mins"),
    briefText: must("brief-text"),
    connect: must("connect"),
    connectBtn: must("connect-btn")
  };
  var store = readStore();
  var cur = lisbonDay();
  var speechGen = 0;

  function must(id) {
    var el = document.getElementById(id);
    if (!el) throw new Error("missing #" + id);
    return el;
  }

  function readStore() {
    var raw;
    var data;
    try {
      raw = localStorage.getItem(STORE_KEY);
    } catch (err) {
      return MirrorCore.blankStore();
    }
    if (!raw) return MirrorCore.blankStore();
    try {
      data = JSON.parse(raw);
    } catch (err) {
      return MirrorCore.blankStore();
    }
    if (!data || typeof data !== "object" || !data.days || typeof data.days !== "object") return MirrorCore.blankStore();
    return data;
  }

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (err) {}
  }

  function node(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function lisbonDay() {
    return MirrorCore.lisbonToday(new Date());
  }

  function readKey() {
    var hash = location.hash.replace(/^#/, "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(hash)) {
      try {
        MirrorCore.label(hash);
        return hash;
      } catch (err) {}
    }
    return lisbonDay();
  }

  function dayOf(key) {
    var day = store.days[key];
    if (!day || typeof day !== "object") return null;
    return day;
  }

  function asText(value) {
    return typeof value === "string" ? value : "";
  }

  function briefString(day) {
    return day && typeof day.brief === "string" ? day.brief : "";
  }

  function sunLine(day) {
    var sun = day && day.sunCaffeine && typeof day.sunCaffeine === "object" ? day.sunCaffeine : null;
    var text = sun && typeof sun.text === "string" ? sun.text.trim() : "";
    return text || SUN_FALLBACK;
  }

  function paintSunlight(day) {
    els.sunlight.textContent = "";
    els.sunlight.appendChild(node("p", "sun-text", sunLine(day)));
  }

  function weatherLine(day) {
    var weather = day && day.weather && typeof day.weather === "object" ? day.weather : null;
    var summary = weather ? asText(weather.summary).trim() : "";
    var hi = weather && Number.isFinite(weather.hiC) ? String(weather.hiC) : "";
    var lo = weather && Number.isFinite(weather.loC) ? String(weather.loC) : "";
    var temps = "";
    var line = MirrorCore.label(cur);
    if (hi && lo) temps = hi + "\u00b0 / " + lo + "\u00b0";
    else if (hi) temps = hi + "\u00b0";
    line += " \u00b7 " + (summary || "No weather yet.");
    if (temps) line += " " + temps;
    return line;
  }

  function paintBrief(day) {
    var brief = briefString(day).trim();
    var mins = brief ? MirrorCore.minutes(brief) : 0;
    els.briefText.textContent = brief || "No brief yet.";
    els.briefText.classList.toggle("muted", !brief);
    els.mins.textContent = mins ? "About " + mins + " min" : "";
    els.play.disabled = !brief;
    if (!brief) stopSpeech();
  }

  function render() {
    var day = dayOf(cur);
    els.weather.textContent = weatherLine(day);
    paintSunlight(day);
    paintBrief(day);
  }

  function englishVoice() {
    var voices = window.speechSynthesis.getVoices();
    var i;
    var voice;
    for (i = 0; i < voices.length; i++) {
      voice = voices[i];
      if (voice.lang && voice.lang.toLowerCase().indexOf("en") === 0 && /samantha|google uk english female|google us english/i.test(voice.name)) {
        return voice;
      }
    }
    for (i = 0; i < voices.length; i++) {
      voice = voices[i];
      if (voice.lang && voice.lang.toLowerCase().indexOf("en") === 0) return voice;
    }
    return null;
  }

  function rememberLabel(label) {
    try { localStorage.setItem("mirror-voice", label); } catch (err) {}
  }

  function finishSpeech(gen) {
    if (gen !== speechGen) return;
    els.play.textContent = "Play";
    els.play.setAttribute("aria-pressed", "false");
  }

  function stopSpeech() {
    speechGen += 1;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    finishSpeech(speechGen);
  }

  function startSpeech(text) {
    var utt;
    var voice;
    var gen;
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance !== "function") return false;
    speechGen += 1;
    gen = speechGen;
    window.speechSynthesis.cancel();
    utt = new SpeechSynthesisUtterance(text);
    voice = englishVoice();
    if (voice) {
      utt.voice = voice;
      utt.lang = voice.lang || "en-US";
      rememberLabel(voice.name + " " + (voice.lang || ""));
    } else {
      utt.lang = "en-US";
    }
    utt.rate = 1;
    utt.onend = function () { finishSpeech(gen); };
    utt.onerror = function () { finishSpeech(gen); };
    function say() {
      if (gen !== speechGen) return;
      window.speechSynthesis.speak(utt);
    }
    window.speechSynthesis.addEventListener("voiceschanged", function once() {
      window.speechSynthesis.removeEventListener("voiceschanged", once);
      voice = englishVoice();
      if (voice) utt.voice = voice;
      say();
    });
    say();
    return true;
  }

  function onPlay() {
    var brief = briefString(dayOf(cur)).trim();
    if (!brief) return;
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      stopSpeech();
      return;
    }
    if (!startSpeech(brief)) {
      els.play.textContent = "Speech is unavailable in this browser";
      return;
    }
    els.play.textContent = "Stop";
    els.play.setAttribute("aria-pressed", "true");
  }

  function mergeIn(remote) {
    store = MirrorCore.mergeStores(store, remote);
    persist();
    render();
  }

  function hasToken() {
    try {
      return !!localStorage.getItem("dong-gh-sync");
    } catch (err) {
      return false;
    }
  }

  function showConnect() {
    els.connect.hidden = hasToken();
  }

  function fail(err) {
    els.syncLabel.textContent = err && err.message ? err.message : "Sync failed";
    showConnect();
  }

  function autoLoad() {
    showConnect();
    if (!hasToken()) {
      els.syncLabel.textContent = "Not connected";
      return;
    }
    els.syncLabel.textContent = "Syncing\u2026";
    GhSync.load("mirror", mergeIn).then(function () {
      els.syncLabel.textContent = "Synced";
      showConnect();
    }, function (err) {
      fail(err);
    });
  }

  function showToday() {
    cur = readKey();
    stopSpeech();
    render();
  }

  els.play.addEventListener("click", onPlay);
  els.connectBtn.addEventListener("click", function () {
    GhSync.load("mirror", mergeIn).then(function () {
      els.syncLabel.textContent = "Synced";
      showConnect();
    }, function (err) {
      fail(err);
    });
  });
  window.addEventListener("hashchange", function () {
    showToday();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && cur !== lisbonDay() && !/^\d{4}-\d{2}-\d{2}$/.test(location.hash.replace(/^#/, ""))) {
      showToday();
    }
  });

  showToday();
  autoLoad();
})();
