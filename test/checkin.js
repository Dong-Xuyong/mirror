"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var core = require("../core.js");

var DAY = "2026-10-14";

function yellowMeter() {
  return {
    quadrant: "yellow",
    energy: "high",
    pleasantness: "high",
    updatedAt: "2026-10-14T08:00:00.000Z"
  };
}

test("lisbonToday uses Europe/Lisbon, including the DST edge", function () {
  assert.equal(core.lisbonToday(new Date("2026-10-14T22:30:00Z")), "2026-10-14");
  assert.equal(core.lisbonToday(new Date("2026-10-14T23:30:00Z")), "2026-10-15");
  assert.equal(core.lisbonToday(new Date("2026-01-15T00:30:00Z")), "2026-01-15");
});

test("mood quadrants map onto mood and energy 1-5", function () {
  var list = core.moodQuadrants();
  var byId = {};
  var i;
  assert.equal(list.length, 4);
  for (i = 0; i < list.length; i++) byId[list[i].id] = list[i];
  assert.equal(byId.red.energy, "high");
  assert.equal(byId.red.pleasantness, "low");
  assert.equal(byId.red.mood, 2);
  assert.equal(byId.red.energyScore, 4);
  assert.equal(byId.yellow.mood, 5);
  assert.equal(byId.yellow.energyScore, 5);
  assert.equal(byId.blue.mood, 1);
  assert.equal(byId.blue.energyScore, 1);
  assert.equal(byId.green.mood, 4);
  assert.equal(byId.green.energyScore, 2);
  list[0].mood = 9;
  assert.equal(core.moodQuadrants()[0].mood, 2);
});

test("applyJournalCheckin writes only today's check-in and reuses entry scores", function () {
  var quotes = { "2026-10-13": { text: "keep", updatedAt: "x" } };
  var habits = [{ id: "sunlight", label: "Morning sunlight 10 min" }];
  var journal = {
    version: 1,
    quotes: quotes,
    habitDefs: habits,
    entries: {
      "2026-10-13": { fields: { mood: 2, energy: 2 }, todos: [] },
      "2026-10-14": {
        updatedAt: "old",
        closed: true,
        fields: { mood: 3, energy: 3, grateful: ["keep this"], focus: "keep" },
        todos: [{ id: "t1", text: "keep todo", done: false }]
      }
    },
    days: { "2026-10-13": { mood: 2, note: "leave" } }
  };

  core.applyJournalCheckin(journal, DAY, {
    moodMeter: yellowMeter(),
    mood: 1,
    energy: 1,
    sleep: { hours: 7, quality: "good", wake: "06:40", updatedAt: "2026-10-14T08:01:00.000Z" },
    sunlight: true,
    caffeine: false,
    top3: [{ text: "One", done: false, id: "drop" }, { text: "Two", done: true }],
    todos: [{ text: "nope" }],
    updatedAt: "nope"
  });

  assert.equal(journal.version, 1);
  assert.strictEqual(journal.quotes, quotes);
  assert.strictEqual(journal.habitDefs, habits);
  assert.equal(journal.days["2026-10-13"].note, "leave");
  assert.equal(journal.days["2026-10-13"].mood, 2);
  assert.equal(journal.entries["2026-10-13"].fields.mood, 2);
  assert.equal(journal.entries[DAY].updatedAt, "old");
  assert.equal(journal.entries[DAY].closed, true);
  assert.equal(journal.entries[DAY].fields.grateful[0], "keep this");
  assert.equal(journal.entries[DAY].fields.focus, "keep");
  assert.equal(journal.entries[DAY].fields.mood, 5);
  assert.equal(journal.entries[DAY].fields.energy, 5);
  assert.equal(journal.entries[DAY].todos[0].text, "keep todo");
  assert.equal(journal.days[DAY].mood, 5);
  assert.equal(journal.days[DAY].energy, 5);
  assert.deepEqual(journal.days[DAY].moodMeter, yellowMeter());
  assert.deepEqual(journal.days[DAY].sleep, {
    hours: 7,
    quality: "good",
    wake: "06:40",
    updatedAt: "2026-10-14T08:01:00.000Z"
  });
  assert.equal(journal.days[DAY].sunlight, true);
  assert.equal(journal.days[DAY].caffeine, false);
  assert.deepEqual(journal.days[DAY].top3, [
    { text: "One", done: false },
    { text: "Two", done: true }
  ]);
  assert.equal(journal.days[DAY].top3UpdatedAt, undefined);
  assert.equal(journal.days[DAY].todos, undefined);
  assert.equal(journal.days[DAY].updatedAt, undefined);
});

test("a later patch merges today's fields and keeps a concurrent edit", function () {
  var journal = {
    version: 1,
    quotes: { a: 1 },
    days: { "2026-10-14": { mood: 5, energy: 5, caffeine: true, note: "from elsewhere" } },
    entries: {
      "2026-10-14": {
        fields: { focus: "keep", grateful: ["g"], mood: 5, energy: 5 },
        todos: [{ id: "t", text: "new", done: false }]
      }
    }
  };
  core.applyJournalCheckin(journal, DAY, {
    sleep: { hours: "9+", quality: "ok", updatedAt: "t" }
  });
  assert.equal(journal.days[DAY].note, "from elsewhere");
  assert.equal(journal.days[DAY].caffeine, true);
  assert.equal(journal.days[DAY].mood, 5);
  assert.equal(journal.days[DAY].sleep.hours, "9+");
  assert.equal(journal.days[DAY].sleep.wake, undefined);
  assert.equal(journal.entries[DAY].fields.focus, "keep");
  assert.equal(journal.entries[DAY].fields.grateful[0], "g");
  assert.equal(journal.entries[DAY].todos[0].text, "new");
  assert.equal(journal.quotes.a, 1);

  core.applyJournalCheckin(journal, DAY, { sunlight: null, sleep: { hours: 4, updatedAt: "no" } });
  assert.equal("sunlight" in journal.days[DAY], false);
  assert.equal(journal.days[DAY].sleep.hours, "9+");
});

test("missing day and entry are created without inventing todos", function () {
  var journal = { version: 1 };
  core.applyJournalCheckin(journal, DAY, { moodMeter: { quadrant: "blue", updatedAt: "t" } });
  assert.equal(journal.days[DAY].mood, 1);
  assert.equal(journal.days[DAY].energy, 1);
  assert.equal(journal.days[DAY].moodMeter.energy, "low");
  assert.equal(journal.days[DAY].moodMeter.pleasantness, "low");
  assert.deepEqual(journal.entries[DAY], { fields: { mood: 1, energy: 1 } });
});

test("refuses to rewrite a days value that is not an object", function () {
  var journal = { version: 1, days: [], entries: { "2026-10-14": { fields: { mood: 3 } } } };
  assert.throws(function () {
    core.applyJournalCheckin(journal, DAY, { sunlight: true });
  }, /journal\.days/);
  assert.ok(Array.isArray(journal.days));
  assert.equal(journal.entries[DAY].fields.mood, 3);
  assert.throws(function () {
    core.applyJournalCheckin({ version: 1 }, "today", { sunlight: true });
  }, /bad day key/);
});

test("jsonIndent keeps the file's existing indent", function () {
  assert.equal(core.jsonIndent('{"a":1}'), 0);
  assert.equal(core.jsonIndent('{\n  "a": 1\n}'), 2);
  assert.equal(core.jsonIndent('{\n\t"a": 1\n}'), "\t");
});
