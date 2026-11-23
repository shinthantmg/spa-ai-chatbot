import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, parseTime, nowInBangkok, formatDate } from "../../js/core/dates.js";

const TODAY = "2026-12-02"; // a Wednesday

test("reads relative dates", () => {
  assert.equal(parseDate("can I come today?", TODAY), "2026-12-02");
  assert.equal(parseDate("tomorrow please", TODAY), "2026-12-03");
  assert.equal(parseDate("the day after tomorrow", TODAY), "2026-12-04");
});

test("reads weekdays as the next one", () => {
  assert.equal(parseDate("this Saturday", TODAY), "2026-12-05");
  assert.equal(parseDate("on sunday", TODAY), "2026-12-06");
  assert.equal(parseDate("wednesday", TODAY), "2026-12-02");
  assert.equal(parseDate("next wednesday", TODAY), "2026-12-09");
});

test("reads written dates, choosing next year when needed", () => {
  assert.equal(parseDate("25 Dec", TODAY), "2026-12-25");
  assert.equal(parseDate("December 31st", TODAY), "2026-12-31");
  assert.equal(parseDate("5 january", TODAY), "2027-01-05");
  assert.equal(parseDate("on 10/1", TODAY), "2027-01-10");       // day first
  assert.equal(parseDate("2026-12-24", TODAY), "2026-12-24");
  assert.equal(parseDate("31/2", TODAY), null);                    // not a real date
  assert.equal(parseDate("a 60 min massage", TODAY), null);
});

test("reads times in a spa's opening hours", () => {
  assert.equal(parseTime("at 3pm"), "15:00");
  assert.equal(parseTime("3:30 pm"), "15:30");
  assert.equal(parseTime("15:00"), "15:00");
  assert.equal(parseTime("around 11am"), "11:00");
  assert.equal(parseTime("12pm"), "12:00");
  assert.equal(parseTime("4:30"), "16:30");  // no am/pm: afternoon at a spa
  assert.equal(parseTime("noon"), "12:00");
  assert.equal(parseTime("a 90 min massage"), null);
  assert.equal(parseTime("13pm"), null);
});

test("uses Bangkok time whatever the computer's time zone is", () => {
  assert.deepEqual(nowInBangkok(new Date("2026-12-02T20:30:00Z")), { date: "2026-12-03", minutes: 3 * 60 + 30 });
  assert.equal(formatDate("2026-12-03"), "Thursday 3 December");
});
