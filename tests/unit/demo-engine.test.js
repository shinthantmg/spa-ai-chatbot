import { test } from "node:test";
import assert from "node:assert/strict";
import { createFrontDesk, memoryStore } from "../../js/core/booking.js";
import { createDemoEngine } from "../../js/demo-engine.js";

const NOW = () => new Date("2026-12-02T10:05:00+07:00");

function setup() {
  const store = memoryStore();
  const desk = createFrontDesk({ store, now: NOW, simulateOtherCustomers: false });
  const bot = createDemoEngine(desk);
  return { store, bot, say: async text => (await bot.reply(text)).text };
}

test("answers prices from the spa data", async () => {
  const { say } = setup();
  assert.match(await say("How much is a hot stone massage?"), /Hot Stone Massage: 90 minutes, ฿1,400/);
  assert.match(await say("what facials do you have"), /Hydrating Facial \(60 min\): ฿1,100[\s\S]*Brightening Facial \(75 min\): ฿1,500/);
  assert.match(await say("prices"), /Massage: from ฿450/);
});

test("answers opening hours, location and parking", async () => {
  const { say } = setup();
  assert.match(await say("Are you open on Sunday?"), /^Sunday: We're open 10:00 to 21:00/);
  assert.match(await say("where are you?"), /Sukhumvit Soi 24.*BTS Phrom Phong/);
  assert.match(await say("is there parking"), /Free parking/);
});

test("refuses questions that aren't about the spa", async () => {
  const { say } = setup();
  assert.match(await say("what's the capital of France?"), /I can only help with Lotus Spa Bangkok/);
});

test("books step by step and saves the booking", async () => {
  const { say, store } = setup();
  assert.match(await say("I want to book a massage"), /Which one would you like/);
  assert.match(await say("Foot Reflexology (45 min)"), /Which day/);
  assert.match(await say("tomorrow"), /Free times on Thursday 3 December: 10:00/);
  assert.match(await say("2pm"), /14:00 on Thursday 3 December is free. What's your full name/);
  assert.match(await say("Malee Jaidee"), /What's your phone number/);
  assert.match(await say("12345"), /doesn't look like a Thai phone number/);
  assert.match(await say("081-234-5678"), /Please check your booking:[\s\S]*Foot Reflexology[\s\S]*14:00/);
  assert.equal((await store.list()).length, 0); // nothing saved before "yes"
  const done = await say("yes");
  assert.match(done, /You're booked![\s\S]*Your booking code is LS[A-Z2-9]{6}/);
  const saved = await store.list();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].service_id, "foot-45");
  assert.equal(saved[0].time, "14:00");
});

test("one message can carry the whole request", async () => {
  const { say } = setup();
  assert.match(await say("Book a 60 minute Thai massage tomorrow at 5pm"), /17:00 on Thursday 3 December is free/);
});

test("details can be changed before confirming", async () => {
  const { say, store } = setup();
  await say("book a hot stone massage tomorrow at 3pm");
  await say("Malee Jaidee");
  await say("0812345678");
  assert.match(await say("no"), /What would you like to change/);
  assert.match(await say("the time"), /Free times/);
  assert.match(await say("4pm"), /Please check your booking:[\s\S]*16:00/);
  await say("yes");
  assert.equal((await store.list())[0].time, "16:00");
});

test("a side question doesn't lose the booking", async () => {
  const { say } = setup();
  await say("book a foot massage tomorrow");
  assert.match(await say("where are you?"), /Sukhumvit[\s\S]*middle of your booking/);
  assert.match(await say("11am"), /11:00 on Thursday 3 December is free/);
});

test("cancels with booking code and phone", async () => {
  const { say, store } = setup();
  await say("book a foot massage tomorrow at 2pm");
  await say("Malee Jaidee");
  await say("081-234-5678");
  const code = (await say("yes")).match(/LS[A-Z2-9]{6}/)[0];

  assert.match(await say("I need to cancel"), /booking code/);
  assert.match(await say(code), /phone number/);
  assert.match(await say("081-234-5678"), /is cancelled/);
  assert.equal((await store.list()).length, 0);
});

test("customer text is never treated as instructions", async () => {
  const { say } = setup();
  await say("book a foot massage tomorrow at 2pm");
  assert.match(await say("<script>alert(1)</script>"), /Thanks, <script>alert\(1\)<\/script>/); // returned as plain text; the widget shows it with textContent
});
