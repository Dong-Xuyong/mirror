(function () {
  "use strict";

  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function todayKey(date) {
    if (date == null) date = new Date();
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function parseDayKey(key) {
    if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      throw new Error("bad day key");
    }
    var year = Number(key.slice(0, 4));
    var monthIndex = Number(key.slice(5, 7)) - 1;
    var day = Number(key.slice(8, 10));
    var date = new Date(year, monthIndex, day);
    if (date.getFullYear() !== year || date.getMonth() !== monthIndex || date.getDate() !== day) {
      throw new Error("bad day key");
    }
    return date;
  }

  function shift(key, delta) {
    var date = parseDayKey(key);
    return todayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta));
  }

  function label(key) {
    var date = parseDayKey(key);
    return WEEKDAYS[date.getDay()] + " " + date.getDate() + " " + MONTHS[date.getMonth()] + " " + date.getFullYear();
  }

  function blankStore() {
    return { version: 1, days: {} };
  }

  function stamp(entry) {
    if (!entry || typeof entry.updatedAt !== "string" || entry.updatedAt.length === 0) return null;
    return entry.updatedAt;
  }

  function choose(left, right) {
    var a = stamp(left);
    var b = stamp(right);
    if (a == null) return b == null ? left : right;
    if (b == null) return left;
    return b > a ? right : left;
  }

  function copyEntry(entry) {
    if (!entry || typeof entry !== "object") return entry;
    var copy = {};
    var keys = Object.keys(entry);
    var i;
    for (i = 0; i < keys.length; i++) copy[keys[i]] = entry[keys[i]];
    return copy;
  }

  function daysOf(store) {
    if (!store || !store.days || typeof store.days !== "object") return {};
    return store.days;
  }

  function versionOf(store) {
    var version = store && store.version;
    return typeof version === "number" && Number.isFinite(version) ? version : 1;
  }

  function answerOf(day) {
    if (!day || typeof day !== "object" || !Object.prototype.hasOwnProperty.call(day, "answer")) return undefined;
    return day.answer;
  }

  function mergeDays(localDays, remoteDays) {
    var names = Object.keys(localDays).concat(Object.keys(remoteDays));
    var out = {};
    var seen = Object.create(null);
    var i;
    for (i = 0; i < names.length; i++) {
      var key = names[i];
      if (seen[key]) continue;
      seen[key] = true;
      var inLocal = Object.prototype.hasOwnProperty.call(localDays, key);
      var inRemote = Object.prototype.hasOwnProperty.call(remoteDays, key);
      var localDay = localDays[key];
      var remoteDay = remoteDays[key];
      var chosen = inLocal && inRemote ? choose(localDay, remoteDay) : (inLocal ? localDay : remoteDay);
      var copy = copyEntry(chosen);
      if (inLocal && inRemote && copy && typeof copy === "object") {
        var answer = choose(answerOf(localDay), answerOf(remoteDay));
        if (typeof answer === "undefined") delete copy.answer;
        else copy.answer = copyEntry(answer);
      }
      out[key] = copy;
    }
    return out;
  }

  function mergeStores(local, remote) {
    return {
      version: Math.max(versionOf(local), versionOf(remote)),
      days: mergeDays(daysOf(local), daysOf(remote))
    };
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function isDayKey(key) {
    return typeof key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(key);
  }

  function skyOf(weather, hour, isToday) {
    var time = "day";
    var code;
    var sky = "cloud";
    if (isToday) {
      if (hour < 9) time = "dawn";
      else if (hour < 18) time = "day";
      else if (hour < 21) time = "dusk";
      else time = "night";
    }
    if (weather && typeof weather === "object") {
      code = weather.code;
      if (!isFiniteNumber(code)) {
        sky = weather.rainMm > 1 ? "rain" : "cloud";
      } else if (code === 0 || code === 1) sky = "clear";
      else if (code === 2 || code === 3) sky = "cloud";
      else if (code === 45 || code === 48) sky = "fog";
      else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) sky = "rain";
      else if ((code >= 71 && code <= 77) || code === 85 || code === 86) sky = "snow";
      else if (code >= 95 && code <= 99) sky = "storm";
    }
    return { sky: sky, time: time };
  }

  function sleepStat(nutrition, key) {
    var day;
    var hours;
    var target;
    if (!nutrition || typeof nutrition !== "object" || !nutrition.days || typeof nutrition.days !== "object") return null;
    day = nutrition.days[key];
    hours = day && day.vitals ? day.vitals.sleepHours : undefined;
    if (!isFiniteNumber(hours)) return null;
    target = nutrition.goals && isFiniteNumber(nutrition.goals.sleepHours) ? nutrition.goals.sleepHours : null;
    return { hours: hours, target: target };
  }

  function weightStat(nutrition, key) {
    var days;
    var names;
    var i;
    var dayKey;
    var weight;
    var best = null;
    var kg;
    var goal;
    if (!nutrition || typeof nutrition !== "object" || !nutrition.days || typeof nutrition.days !== "object") return null;
    days = nutrition.days;
    names = Object.keys(days);
    for (i = 0; i < names.length; i++) {
      dayKey = names[i];
      if (!isDayKey(dayKey) || dayKey > key) continue;
      weight = days[dayKey] && days[dayKey].weight;
      if (!isFiniteNumber(weight)) continue;
      if (best === null || dayKey > best) best = dayKey;
    }
    if (best === null) return null;
    kg = days[best].weight;
    goal = nutrition.goals && isFiniteNumber(nutrition.goals.weight) ? nutrition.goals.weight : null;
    return { kg: kg, goal: goal, delta: typeof goal === "number" ? kg - goal : null };
  }

  function liftDetail(day) {
    var sets;
    var i;
    var item;
    var detail;
    if (!day || typeof day !== "object" || !Array.isArray(day.sets)) return "";
    sets = day.sets;
    for (i = 0; i < sets.length; i++) {
      item = sets[i];
      if (!item || typeof item !== "object") continue;
      detail = "";
      if (isFiniteNumber(item.sets) && isFiniteNumber(item.reps)) detail = item.sets + "x" + item.reps;
      if (isFiniteNumber(item.kg) && isFiniteNumber(item.kgMax)) detail += " @ " + item.kg + "\u2013" + item.kgMax + " kg";
      else if (isFiniteNumber(item.kg)) detail += " @ " + item.kg + " kg";
      return detail;
    }
    return "";
  }

  function nextLift(streetlifting) {
    var programs;
    var keys;
    var key;
    var program;
    var days;
    var i;
    var day = null;
    if (!streetlifting || typeof streetlifting !== "object") return null;
    programs = streetlifting.programs;
    if (!programs || typeof programs !== "object") return null;
    keys = Object.keys(programs);
    if (!keys.length) return null;
    key = keys[0];
    program = programs[key];
    if (!program || typeof program !== "object" || !Array.isArray(program.days)) return null;
    days = program.days;
    for (i = 0; i < days.length; i++) {
      day = days[i];
      if (day && typeof day.done === "string" && day.done.length > 0) continue;
      return {
        name: typeof program.name === "string" && program.name.length > 0 ? program.name : key,
        label: day && typeof day.label === "string" ? day.label : "",
        detail: liftDetail(day)
      };
    }
    return null;
  }

  function score15(value) {
    if (!isFiniteNumber(value) || !Number.isInteger(value) || value < 1 || value > 5) return null;
    return value;
  }

  function plain(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  // RULER: high energy on top, pleasant on the right.
  // red tense, yellow upbeat, blue low, green calm.
  // Pleasantness maps to mood 1-5. Energy maps to energy 1-5.
  var QUADRANTS = [
    { id: "red", name: "Red", label: "Tense", energy: "high", pleasantness: "low", mood: 2, energyScore: 4 },
    { id: "yellow", name: "Yellow", label: "Upbeat", energy: "high", pleasantness: "high", mood: 5, energyScore: 5 },
    { id: "blue", name: "Blue", label: "Low", energy: "low", pleasantness: "low", mood: 1, energyScore: 1 },
    { id: "green", name: "Green", label: "Calm", energy: "low", pleasantness: "high", mood: 4, energyScore: 2 }
  ];

  function quadrantById(id) {
    var i;
    for (i = 0; i < QUADRANTS.length; i++) if (QUADRANTS[i].id === id) return QUADRANTS[i];
    return null;
  }

  function lisbonToday(date) {
    var when = date == null ? new Date() : date;
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Lisbon",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(when);
    var year = "";
    var month = "";
    var day = "";
    var i;
    for (i = 0; i < parts.length; i++) {
      if (parts[i].type === "year") year = parts[i].value;
      if (parts[i].type === "month") month = parts[i].value;
      if (parts[i].type === "day") day = parts[i].value;
    }
    if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
      throw new Error("bad Lisbon date");
    }
    return year + "-" + month + "-" + day;
  }

  function moodQuadrants() {
    var out = [];
    var i;
    var src;
    for (i = 0; i < QUADRANTS.length; i++) {
      src = QUADRANTS[i];
      out.push({
        id: src.id,
        name: src.name,
        label: src.label,
        energy: src.energy,
        pleasantness: src.pleasantness,
        mood: src.mood,
        energyScore: src.energyScore
      });
    }
    return out;
  }

  function cleanTop3(list) {
    var out = [];
    var i;
    var item;
    if (!Array.isArray(list)) return null;
    for (i = 0; i < list.length && out.length < 3; i++) {
      item = list[i];
      if (!plain(item) || typeof item.text !== "string") continue;
      out.push({ text: item.text, done: item.done === true });
    }
    return out;
  }

  function cleanMeter(meter) {
    var spec;
    if (!plain(meter)) return null;
    spec = quadrantById(meter.quadrant);
    if (!spec) return null;
    return {
      quadrant: spec.id,
      energy: spec.energy,
      pleasantness: spec.pleasantness,
      updatedAt: typeof meter.updatedAt === "string" && meter.updatedAt ? meter.updatedAt : new Date().toISOString()
    };
  }

  function cleanSleep(sleep) {
    var out = {};
    if (!plain(sleep)) return null;
    if (sleep.hours === 5 || sleep.hours === 6 || sleep.hours === 7 || sleep.hours === 8 || sleep.hours === "9+") {
      out.hours = sleep.hours;
    }
    if (sleep.quality === "poor" || sleep.quality === "ok" || sleep.quality === "good") out.quality = sleep.quality;
    if (typeof sleep.wake === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(sleep.wake)) out.wake = sleep.wake;
    if (!has(out, "hours") && !has(out, "quality") && !has(out, "wake")) return null;
    out.updatedAt = typeof sleep.updatedAt === "string" && sleep.updatedAt ? sleep.updatedAt : new Date().toISOString();
    return out;
  }

  function mirrorEntryScores(journal, dayKey, moodValue, energyValue, writeMood, writeEnergy) {
    var entry;
    if (!writeMood && !writeEnergy) return;
    if (journal.entries == null) journal.entries = {};
    if (!plain(journal.entries)) return;
    if (journal.entries[dayKey] == null) journal.entries[dayKey] = {};
    if (!plain(journal.entries[dayKey])) return;
    entry = journal.entries[dayKey];
    if (entry.fields == null) entry.fields = {};
    if (!plain(entry.fields)) return;
    if (writeMood) entry.fields.mood = moodValue;
    if (writeEnergy) entry.fields.energy = energyValue;
  }

  function applyJournalCheckin(journal, dayKey, patch) {
    var day;
    var meter;
    var sleep;
    var top3;
    var spec;
    var writeMood = false;
    var writeEnergy = false;
    if (!plain(journal)) throw new Error("bad journal");
    if (!isDayKey(dayKey)) throw new Error("bad day key");
    if (!plain(patch)) return journal;
    if (journal.days == null) journal.days = {};
    else if (!plain(journal.days)) throw new Error("journal.days is not an object");
    if (journal.days[dayKey] == null) journal.days[dayKey] = {};
    else if (!plain(journal.days[dayKey])) throw new Error("journal day is not an object");
    day = journal.days[dayKey];

    if (has(patch, "top3")) {
      top3 = cleanTop3(patch.top3);
      if (top3 !== null) day.top3 = top3;
    }
    if (has(patch, "top3UpdatedAt") && typeof patch.top3UpdatedAt === "string" && patch.top3UpdatedAt) {
      day.top3UpdatedAt = patch.top3UpdatedAt;
    }
    if (has(patch, "moodMeter")) {
      meter = cleanMeter(patch.moodMeter);
      if (meter) {
        spec = quadrantById(meter.quadrant);
        day.moodMeter = meter;
        day.mood = spec.mood;
        day.energy = spec.energyScore;
        writeMood = true;
        writeEnergy = true;
      }
    }
    if (!writeMood && has(patch, "mood") && score15(patch.mood) !== null) {
      day.mood = patch.mood;
      writeMood = true;
    }
    if (!writeEnergy && has(patch, "energy") && score15(patch.energy) !== null) {
      day.energy = patch.energy;
      writeEnergy = true;
    }
    if (has(patch, "sleep")) {
      sleep = cleanSleep(patch.sleep);
      if (sleep) day.sleep = sleep;
    }
    if (has(patch, "sunlight")) {
      if (patch.sunlight === null) delete day.sunlight;
      else if (typeof patch.sunlight === "boolean") day.sunlight = patch.sunlight;
    }
    if (has(patch, "caffeine")) {
      if (patch.caffeine === null) delete day.caffeine;
      else if (typeof patch.caffeine === "boolean") day.caffeine = patch.caffeine;
    }
    if (writeMood || writeEnergy) mirrorEntryScores(journal, dayKey, day.mood, day.energy, writeMood, writeEnergy);
    return journal;
  }

  function jsonIndent(raw) {
    var match;
    if (typeof raw !== "string") return 2;
    match = /\n(\t+)"/.exec(raw);
    if (match) return "\t";
    match = /\n( +)"/.exec(raw);
    if (match) return match[1].length;
    if (raw.indexOf("\n") === -1) return 0;
    return 2;
  }

  function moodFromDays(journal, key) {
    var day;
    var mood;
    var energy;
    if (!plain(journal.days)) return null;
    day = journal.days[key];
    if (!plain(day)) return null;
    mood = score15(day.mood);
    energy = score15(day.energy);
    if (mood === null && energy === null) return null;
    return { mood: mood, energy: energy, date: key };
  }

  function moodOn(journal, key) {
    var entry;
    var fields;
    var mood;
    var energy;
    var fromDay = moodFromDays(journal, key);
    if (fromDay) return fromDay;
    if (!journal.entries || typeof journal.entries !== "object" || Array.isArray(journal.entries)) return null;
    entry = journal.entries[key];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    fields = entry.fields;
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
    mood = score15(fields.mood);
    energy = score15(fields.energy);
    if (mood === null && energy === null) return null;
    return { mood: mood, energy: energy, date: key };
  }

  function moodStat(journal, key) {
    var found;
    try {
      if (!journal || typeof journal !== "object") return null;
      found = moodOn(journal, key);
      if (found) return found;
      return moodOn(journal, shift(key, -1));
    } catch (err) {
      return null;
    }
  }

  function minutes(text) {
    var words;
    if (typeof text !== "string" || text.trim().length === 0) return 0;
    words = text.trim().split(/\s+/);
    return Math.max(1, Math.round(words.length / 150));
  }

  var api = {
    blankStore: blankStore,
    todayKey: todayKey,
    shift: shift,
    label: label,
    mergeStores: mergeStores,
    skyOf: skyOf,
    sleepStat: sleepStat,
    weightStat: weightStat,
    nextLift: nextLift,
    moodStat: moodStat,
    minutes: minutes,
    lisbonToday: lisbonToday,
    moodQuadrants: moodQuadrants,
    applyJournalCheckin: applyJournalCheckin,
    jsonIndent: jsonIndent
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.MirrorCore = api;
})();
