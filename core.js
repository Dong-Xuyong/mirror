(function () {
  "use strict";

  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

  function minutes(text) {
    var words;
    if (typeof text !== "string" || text.trim().length === 0) return 0;
    words = text.trim().split(/\s+/);
    return Math.max(1, Math.round(words.length / 150));
  }

  var api = {
    blankStore: blankStore,
    label: label,
    mergeStores: mergeStores,
    minutes: minutes,
    lisbonToday: lisbonToday
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.MirrorCore = api;
})();
