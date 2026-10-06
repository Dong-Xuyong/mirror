# Mirror writer contract

Write the user's morning brief into the private GitHub repo `Dong-Xuyong/progress-sync`, file `mirror.json`, with the GitHub Contents API. Do not write Obsidian notes. The website reads this file itself.

## File shape (version 1)

`version` is `1`. `days` is keyed by the local date `YYYY-MM-DD` in Europe/Lisbon. The `2026-10-07` object below is fake. Do not copy its numbers or sentences into a real day.

```json
{
  "version": 1,
  "days": {
    "2026-10-07": {
      "updatedAt": "2026-10-07T08:00:00Z",
      "weather": {
        "summary": "FAKE. Dry morning.",
        "hiC": 99,
        "loC": -99,
        "rainMm": 0
      },
      "insight": {
        "slug": "fake-slug",
        "title": "Fake Concept",
        "why": "FAKE. This sentence is not a real signal."
      },
      "brief": "FAKE spoken script. Do not read this aloud.",
      "opinion": "FAKE opinion sentence.",
      "question": "FAKE question?",
      "answer": {
        "text": "",
        "updatedAt": ""
      }
    }
  }
}
```

Each real day has:

- `updatedAt`: ISO-8601 UTC.
- `weather`: `{ "summary": string, "hiC": number, "loC": number, "rainMm": number }`. Omit the object if the forecast request fails.
- `insight`: `{ "slug", "title", "why" }`. Omit the object if the wiki pool fails to load, or if no item matches a signal you saw.
- `brief`: string. The spoken script.
- `opinion`: string. One sentence.
- `question`: string. One question.
- `answer`: `{ "text", "updatedAt" }`. The user writes this. You never change it.

## What you read first

GET these before writing. Progress-sync files are in `Dong-Xuyong/progress-sync`. For those four, `GET https://api.github.com/repos/Dong-Xuyong/progress-sync/contents/<file>` with `Authorization: Bearer <token>`. Decode `content` from base64. Keep the `sha` from `mirror.json`.

1. `mirror.json`. You need yesterday's `answer` and the `sha`. If this GET is 404, the file is new. If it is any other non-200, stop and do not write.
2. `journal.json`. Day key `YYYY-MM-DD`. Inside `entries[day].fields`: `mood` (1-5), `energy` (1-5), `focus`, `grateful` (3 strings), `makeGreat`, `affirmation`, `highlights`, `better`. `entries[day].todos` is `{ "id", "text", "done" }`. `quotes[day].text` is the quote. See `journal/CONTRACT.md` only if you need a field you do not understand. Do not write `journal.json`.
3. `nutrition.json`. `goals.weight` (kg), `goals.sleepHours`, `goals.calories`. `days[day].weight`. `days[day].vitals.sleepHours` is hours slept. The date key is the morning you woke, so today's key is last night. Do not write `nutrition.json`.
4. `streetlifting.json`. `sessions[day]` has `lifts`, `activities`, `bw`, `coach`, `note`. In `programs[lift].days`, the first day without `done` is the next session. `goals` have `lift`, `target`, `reps`. Do not write `streetlifting.json`.
5. Weather, no key. GET exactly:

   `https://api.open-meteo.com/v1/forecast?latitude=41.44&longitude=-8.30&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_hours&hourly=precipitation_probability&timezone=Europe/Lisbon&forecast_days=1`

   This is Guimarães, Portugal. Do not change the URL. `summary` is one short clause you write from that JSON. A rain window is the local hours where `hourly.precipitation_probability` is 50 or higher. Name that window in the clause when it exists. `hiC` is `daily.temperature_2m_max[0]`, `loC` is `daily.temperature_2m_min[0]`, `rainMm` is `daily.precipitation_sum[0]`. Copy those numbers. Use index 0 only when `daily.time[0]` is today in Europe/Lisbon. If the request fails, omit `weather`. Do not invent a forecast.
6. Wiki pool. GET `https://dong-xuyong.github.io/mirror/wiki-pool.json`. It is `{ "concepts": [ { "slug", "title", "definition", "url" } ] }`. Pick ONE concept whose `definition` matches a real signal you actually saw (sleep, mood, training, rain, an open todo). `insight.slug` and `insight.title` come from that item. `insight.why` is one sentence naming the signal. If the pool fails to load, or nothing matches, omit `insight`. Do not invent a slug.

## The brief

English. Spoken aloud. No headings, no bullets, and no URL in the spoken text. Aim for 450-700 words when the logs have data. If a section has no data, one honest sentence ("No sleep logged.") and move on. Never invent a number, a mood, a weight, a session, or a forecast. Never pad.

Today is the Europe/Lisbon calendar date you are writing. Yesterday is the Lisbon calendar day before that.

Order:

1. Weather, and what it means for a walk, a run, or training outside. If you omitted `weather`, say the forecast did not load.
2. Body. Last night's sleep is `nutrition.json` `days[today].vitals.sleepHours` against `goals.sleepHours`. Compare `days[today].weight` to `goals.weight` only when both numbers exist. Then the last streetlifting session (the latest `sessions` key on or before today) and the next program day (the first `programs[lift].days` entry without `done`, including `goals` `target` and `reps` when they are present).
3. Mind. Recent mood and energy: the newest journal day before today, and no older than 7 Lisbon days, that has `mood` or `energy`. Name that date. Then yesterday's `fields.better`, and `mirror.json` `days[yesterday].answer.text`. If they answered, use their words. If `text` is missing or empty, say they did not answer.
4. One wiki insight. Say the title and the why, in speech. No URL. If you omitted `insight`, one honest sentence, then move on.
5. Today. The first 1-3 items in `entries[today].todos` whose `done` is false, in file order. If none are open, say so.
6. The opinion (one sentence, firm, based only on the data above) and the question (one question they can answer in a sentence or two).

Also set `opinion` and `question` to those same two sentences, so the page can show them apart from the script. The brief includes them at the end too. Do not write a second wording.

## Write rules

- Set `updatedAt` on the day you write to the current UTC ISO-8601 time. Leave `answer.updatedAt` alone.
- Leave `answer` exactly as you read it. If the day is new and there is no answer, set `answer` to `{ "text": "", "updatedAt": "" }`.
- Read `mirror.json` first. Change only today's day. Keep `version` and every other day. PUT the full JSON with the `sha` from the GET. On 409, GET again and retry once. On that retry, copy today's `answer` from the fresh GET, then apply your brief fields. If the second PUT returns 409, stop.
- If the GET is 404, PUT a new file: `version` 1 and today's day only. Send no `sha`.
- Message: `"Save mirror"`. `content` is base64 of the UTF-8 JSON. Header: `Authorization: Bearer <token>`. API: `PUT https://api.github.com/repos/Dong-Xuyong/progress-sync/contents/mirror.json`.
- Token: a fine-grained PAT with Contents read and write on `Dong-Xuyong/progress-sync` only. Do not put the token in any repo.
- The website writes only `answer`. If the file changed between your GET and PUT, the retry must keep the newer answer.
