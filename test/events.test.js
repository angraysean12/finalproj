import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseClock,
  formatClock,
  normaliseAndSortEvents,
  parseThread,
} from "../src/tools.js";

test("parseClock reads the clock formats people actually type", () => {
  assert.equal(parseClock("14:32"), 14 * 60 + 32);
  assert.equal(parseClock("1432"), 14 * 60 + 32);
  assert.equal(parseClock("2:32pm"), 14 * 60 + 32);
  assert.equal(parseClock("2.32 PM"), 14 * 60 + 32);
  assert.equal(parseClock("0645Z"), 6 * 60 + 45);
  assert.equal(parseClock("14:32 SGT"), 14 * 60 + 32);
  assert.equal(parseClock("12:15am"), 15);
  assert.equal(parseClock("12:15pm"), 12 * 60 + 15);
});

test("parseClock returns null rather than guessing", () => {
  assert.equal(parseClock("sometime around 3"), null);
  assert.equal(parseClock("later"), null);
  assert.equal(parseClock("25:00"), null);
  assert.equal(parseClock("14:75"), null);
  assert.equal(parseClock(""), null);
  assert.equal(parseClock(undefined), null);
});

test("formatClock round-trips a parsed time", () => {
  assert.equal(formatClock(parseClock("2:05pm")), "14:05");
  assert.equal(formatClock(0), "00:00");
});

test("events come back in chronological order", () => {
  const { events } = normaliseAndSortEvents([
    { time: "14:47", speaker: "Priya", text: "third" },
    { time: "14:32", speaker: "Ops", text: "first" },
    { time: "14:41", speaker: "Ops", text: "second" },
  ]);

  assert.deepEqual(
    events.map((e) => e.text),
    ["first", "second", "third"],
  );
});

test("source refs point back at the original thread position", () => {
  const { events } = normaliseAndSortEvents([
    { time: "14:47", speaker: "Priya", text: "third" },
    { time: "14:32", speaker: "Ops", text: "first" },
  ]);

  assert.deepEqual(
    events.map((e) => [e.text, e.source]),
    [
      ["first", 2],
      ["third", 1],
    ],
  );
});

test("reordering is reported, not done silently", () => {
  const { notes } = normaliseAndSortEvents([
    { time: "14:47", speaker: "A", text: "b" },
    { time: "14:32", speaker: "B", text: "a" },
  ]);

  assert.ok(notes.some((n) => n.includes("not in chronological order")));
});

test("an in-order thread produces no notes", () => {
  const { notes } = normaliseAndSortEvents([
    { time: "14:32", speaker: "A", text: "a" },
    { time: "14:47", speaker: "B", text: "b" },
  ]);

  assert.deepEqual(notes, []);
});

test("two messages claiming the same time are flagged as a contradiction", () => {
  const { notes } = normaliseAndSortEvents([
    { time: "14:52", speaker: "Dev", text: "it is the database" },
    { time: "2.52pm", speaker: "Ravi", text: "always the database" },
  ]);

  assert.ok(notes.some((n) => n.includes("both claim 14:52")));
});

test("an unreadable timestamp is kept and flagged, never dropped", () => {
  const { events, notes } = normaliseAndSortEvents([
    { time: "14:32", speaker: "Ops", text: "first" },
    { time: "sometime around 3", speaker: "Dev", text: "connection pool" },
  ]);

  assert.equal(events.length, 2, "no event may be dropped");

  const unreadable = events.find((e) => e.text === "connection pool");
  assert.equal(unreadable.time_readable, false);
  assert.equal(unreadable.time, "sometime around 3", "the original wording is preserved");
  assert.ok(notes.some((n) => n.includes("no readable timestamp")));
});

test("undated events sort after dated ones", () => {
  const { events } = normaliseAndSortEvents([
    { time: "later", speaker: "A", text: "undated" },
    { time: "14:32", speaker: "B", text: "dated" },
  ]);

  assert.deepEqual(
    events.map((e) => e.text),
    ["dated", "undated"],
  );
});

test("malformed input does not throw", () => {
  const { events } = normaliseAndSortEvents([{}, { time: "14:00" }, null]);
  assert.equal(events.length, 3);
  assert.equal(events[0].speaker, "unknown");
});

// ---------------------------------------------------------------------------
// parseThread — the server-side parse that removes a whole model round-trip
// ---------------------------------------------------------------------------

test("parseThread reads a plain line", () => {
  assert.deepEqual(parseThread("14:32 Ops: portal is timing out"), [
    { time: "14:32", speaker: "Ops", text: "portal is timing out" },
  ]);
});

test("parseThread is not fooled by the colon inside a timestamp", () => {
  const [e] = parseThread("09:15 SecOps: forward me the headers");
  assert.equal(e.time, "09:15");
  assert.equal(e.speaker, "SecOps");
});

test("parseThread handles a colon after the time", () => {
  const [e] = parseThread("1045: Legal: treat it as a potential breach");
  assert.equal(e.time, "1045");
  assert.equal(e.speaker, "Legal");
  assert.equal(e.text, "treat it as a potential breach");
});

test("parseThread handles prose timestamps, with and without a colon", () => {
  const [a] = parseThread("sometime around 3: Dev: might be the connection pool");
  assert.equal(a.time, "sometime around 3");
  assert.equal(a.speaker, "Dev");

  const [b] = parseThread("before lunch SecOps: forced a password reset");
  assert.equal(b.time, "before lunch");
  assert.equal(b.speaker, "SecOps");
});

test("parseThread handles two-word speakers", () => {
  const [a] = parseThread("09:15 Sarah Lim: three calls this morning");
  assert.equal(a.speaker, "Sarah Lim");

  const [b] = parseThread("9.05am Contact Centre: first caller came in at nine");
  assert.equal(b.speaker, "Contact Centre");
});

test("parseThread is not fooled by a capitalised word in the message body", () => {
  const [e] = parseThread("09:24 Helpdesk: Nadia in Finance entered her password");
  assert.equal(e.speaker, "Helpdesk");
  assert.equal(e.text, "Nadia in Finance entered her password");
});

test("parseThread folds a wrapped line into the message above it", () => {
  const events = parseThread("14:32 Ops: portal is timing out\nand has been for ten minutes");
  assert.equal(events.length, 1);
  assert.equal(events[0].text, "portal is timing out and has been for ten minutes");
});

test("parseThread never drops a line it cannot read", () => {
  const events = parseThread("no timestamp and no speaker here");
  assert.equal(events.length, 1);
  assert.equal(events[0].speaker, "unknown");
  assert.equal(events[0].text, "no timestamp and no speaker here");
});

test("parseThread ignores blank lines", () => {
  assert.equal(parseThread("\n\n14:32 Ops: hello\n\n").length, 1);
  assert.deepEqual(parseThread(""), []);
  assert.deepEqual(parseThread(null), []);
});
