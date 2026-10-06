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

  var api = {
    blankStore: blankStore,
    todayKey: todayKey,
    shift: shift,
    label: label,
    mergeStores: mergeStores
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.MirrorCore = api;
})();
