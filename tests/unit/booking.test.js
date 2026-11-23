import { test } from "node:test";
import assert from "node:assert/strict";
import { createFrontDesk, memoryStore, findServices } from "../../js/core/booking.js";

const NOW = () => new Date("2026-12-02T10:05:00+07:00"); // Wednesday 10:05 in Bangkok
const quietDesk = () => createFrontDesk({ store: memoryStore(), now: NOW, simulateOtherCustomers: false });
const details = { name: "Malee Jaidee", phone: "081-234-5678" };

test("finds services from everyday words", () => {
  assert.deepEqual(findServices("how much is hot stone?").map(s => s.id), ["hotstone-90"]);
  assert.deepEqual(findServices("thai massage").map(s => s.id), ["thai-60", "thai-90"]);
  assert.deepEqual(findServices("90 minute thai massage").map(s => s.id), ["thai-90"]);
  assert.deepEqual(findServices("a foot massage").map(s => s.id), ["foot-45"]);
  assert.deepEqual(findServices("what's the weather").map(s => s.id), []);
});

test("free times start every 30 minutes and end by closing time", async () => {
  const r = await quietDesk().checkAvailability({ service_id: "thai-60", date: "2026-12-03" });
  assert.equal(r.ok, true);
  assert.equal(r.free_times[0], "10:00");
  assert.equal(r.free_times.at(-1), "20:00");
  assert.equal(r.free_times.length, 21);
});

test("times that have passed today are not offered", async () => {
  const r = await quietDesk().checkAvailability({ service_id: "thai-60", date: "2026-12-02" });
  assert.equal(r.free_times[0], "10:30");
});

test("dates in the past or more than 60 days ahead are refused", async () => {
  const desk = quietDesk();
  assert.match((await desk.checkAvailability({ service_id: "thai-60", date: "2026-12-01" })).error, /already passed/);
  assert.match((await desk.checkAvailability({ service_id: "thai-60", date: "2027-03-01" })).error, /60 days/);
  assert.equal((await desk.checkAvailability({ service_id: "thai-60", date: "2027-01-31" })).ok, true);
});

test("a booking gets a unique code and fills a therapist", async () => {
  const desk = quietDesk();
  const a = await desk.createBooking({ service_id: "thai-60", date: "2026-12-03", time: "11:00", ...details });
  const b = await desk.createBooking({ service_id: "oil-60", date: "2026-12-03", time: "11:00", name: "Somsak P", phone: "0898765432" });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.match(a.booking.code, /^LS[A-Z2-9]{6}$/);
  assert.notEqual(a.booking.code, b.booking.code);
  assert.equal(a.booking.end_time, "12:00");

  // Both therapists are busy at 11:00 now, so 10:30 (60 min) and 11:00 are gone
  const r = await desk.checkAvailability({ service_id: "thai-60", date: "2026-12-03" });
  assert.ok(!r.free_times.includes("11:00"));
  assert.ok(!r.free_times.includes("10:30"));
  assert.ok(r.free_times.includes("12:00"));

  const c = await desk.createBooking({ service_id: "thai-60", date: "2026-12-03", time: "11:00", ...details });
  assert.equal(c.ok, false);
  assert.equal(c.field, "time");
});

test("booking details are checked", async () => {
  const desk = quietDesk();
  const base = { service_id: "thai-60", date: "2026-12-03", time: "11:00", ...details };
  assert.equal((await desk.createBooking({ ...base, service_id: "massage" })).field, "service");
  assert.equal((await desk.createBooking({ ...base, phone: "12345" })).field, "phone");
  assert.equal((await desk.createBooking({ ...base, phone: "+1 555 123 4567" })).field, "phone");
  assert.equal((await desk.createBooking({ ...base, name: "A" })).field, "name");
  assert.equal((await desk.createBooking({ ...base, time: "20:30" })).field, "time"); // 60 min would end 21:30
  assert.equal((await desk.createBooking({ ...base, phone: "+66 81 234 5678" })).ok, true);
});

test("cancelling needs the right code and phone", async () => {
  const desk = quietDesk();
  const { booking } = await desk.createBooking({ service_id: "foot-45", date: "2026-12-04", time: "15:00", ...details });
  assert.equal((await desk.cancelBooking({ code: booking.code, phone: "0899999999" })).ok, false);
  assert.equal((await desk.cancelBooking({ code: "LSAAAAAA", phone: details.phone })).ok, false);
  const ok = await desk.cancelBooking({ code: booking.code.toLowerCase(), phone: "081 234 5678" });
  assert.equal(ok.ok, true);
  assert.equal((await desk.checkAvailability({ service_id: "foot-45", date: "2026-12-04" })).free_times.includes("15:00"), true);
});
