// ============================================================
// booking.js: the "front desk". Finds services, checks opening
// hours and free times, and makes or cancels bookings.
//
// Both chat modes use these same functions:
//   - Demo mode calls them directly in the browser.
//   - AI mode lets the AI call them as "tools" on the server,
//     so the AI can only answer with real data.
// ============================================================
import { SPA, SERVICES, CATEGORIES, baht } from "./spa-data.js";
import { nowInBangkok, addDays, toMinutes, toTime, formatDate, DAY_NAMES, weekday } from "./dates.js";

// ---------- Finding services ----------
const normalise = s => s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();

// Returns the services a message is talking about, best match first.
// "90 minute thai massage" -> [thai-90]; "thai massage" -> [thai-60, thai-90]
export function findServices(text) {
  const t = ` ${normalise(text)} `;
  const scored = SERVICES.map(s => {
    let score = 0;
    for (const k of s.keys) if (t.includes(` ${k} `) || t.includes(` ${k}s `)) score = Math.max(score, k.length);
    if (score && new RegExp(`\\b${s.min}\\s*(min|mins|minute|minutes)?\\b`).test(t)) score += 50;
    if (t.includes(` ${s.id} `)) score += 100;
    return { s, score };
  }).filter(x => x.score > 0);
  if (!scored.length) return [];
  const best = Math.max(...scored.map(x => x.score));
  return scored.filter(x => x.score === best).map(x => x.s);
}

export const getService = id => SERVICES.find(s => s.id === id) || null;

export const describeService = s => ({
  id: s.id, category: s.cat, name: s.name, minutes: s.min, price_thb: s.price,
  price: baht(s.price), description: s.desc
});

// ---------- Rules ----------
const PHONE_RE = /^(\+66|0)\d{8,9}$/;
export const cleanPhone = p => String(p || "").replace(/[\s()-]/g, "");
export const isThaiPhone = p => PHONE_RE.test(cleanPhone(p));

function randomCode(existing) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
  let code;
  do {
    const n = globalThis.crypto.getRandomValues(new Uint32Array(6));
    code = "LS" + Array.from(n, x => chars[x % chars.length]).join("");
  } while (existing.has(code));
  return code;
}

// Some times look booked by other customers, so the demo feels like a real,
// busy spa. The same date always gives the same pattern. A real system would
// read these from its database instead.
function demoBusy(date) {
  let seed = [...date].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const busy = [];
  for (let t = SPA.openHour * 60; t < SPA.closeHour * 60; t += 60) {
    if (rand() < 0.25) for (let i = 0; i < SPA.therapists; i++) busy.push({ start: t, end: t + 60 });
  }
  return busy;
}

// ---------- The front desk ----------
// store:  where bookings are kept: { list(), add(booking), remove(code) }
// now:    a function returning the current time (tests pass a fixed time)
export function createFrontDesk({ store, now = () => new Date(), simulateOtherCustomers = true }) {
  const today = () => nowInBangkok(now());
  const lastBookableDay = () => addDays(today().date, SPA.bookingDaysAhead);

  function checkDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return "Please give the date as YYYY-MM-DD.";
    if (date < today().date) return `${formatDate(date)} has already passed.`;
    if (date > lastBookableDay()) return `We take bookings up to ${SPA.bookingDaysAhead} days ahead, until ${formatDate(lastBookableDay())}.`;
    return null;
  }

  async function freeTimes(service, date) {
    const bookings = (await store.list()).filter(b => b.date === date);
    const taken = [
      ...(simulateOtherCustomers ? demoBusy(date) : []),
      ...bookings.map(b => ({ start: toMinutes(b.time), end: toMinutes(b.time) + b.minutes }))
    ];
    const { date: todayDate, minutes: nowMins } = today();
    const times = [];
    let allPast = true;
    for (let start = SPA.openHour * 60; start + service.min <= SPA.closeHour * 60; start += SPA.slotMinutes) {
      const end = start + service.min;
      const past = date === todayDate && start <= nowMins;
      if (!past) allPast = false;
      const overlapping = taken.filter(t => t.start < end && start < t.end).length;
      if (!past && overlapping < SPA.therapists) times.push(toTime(start));
    }
    return { times, allPast };
  }

  return {
    today: () => today().date,

    // All services, or one category
    listServices(category) {
      const cat = category && CATEGORIES.find(c => c.toLowerCase() === String(category).toLowerCase());
      if (category && !cat) return { ok: false, error: `Unknown category. Categories: ${CATEGORIES.join(", ")}.` };
      return { ok: true, categories: CATEGORIES, services: SERVICES.filter(s => !cat || s.cat === cat).map(describeService) };
    },

    // Opening hours, address, payment and other facts
    spaInfo() {
      return {
        ok: true,
        name: SPA.name,
        opening_hours: `${SPA.openHour}:00 to ${SPA.closeHour}:00, ${SPA.openDays}. The last appointment must finish by ${SPA.closeHour}:00.`,
        address: SPA.address, directions: SPA.directions,
        phone: SPA.phone, email: SPA.email, line: SPA.line,
        payment_methods: SPA.payment, parking: SPA.parking,
        cancellation_policy: SPA.cancellation, arrival: SPA.arrival, health_note: SPA.health,
        booking_window: `From today up to ${SPA.bookingDaysAhead} days ahead (${formatDate(lastBookableDay())}).`,
        today: `${DAY_NAMES[weekday(today().date)]} ${today().date}`
      };
    },

    async checkAvailability({ service_id, date }) {
      const service = getService(service_id);
      if (!service) return { ok: false, error: "Unknown service_id. Use one of the ids from list_services." };
      const dateError = checkDate(date);
      if (dateError) return { ok: false, error: dateError };
      const { times, allPast } = await freeTimes(service, date);
      return {
        ok: true, service: describeService(service), date, date_text: formatDate(date), free_times: times,
        note: times.length ? undefined : allPast ? "No more times today." : "This day is fully booked."
      };
    },

    async createBooking({ service_id, date, time, name, phone }) {
      const service = getService(service_id);
      if (!service) return { ok: false, field: "service", error: "Unknown service." };
      const dateError = checkDate(date);
      if (dateError) return { ok: false, field: "date", error: dateError };
      const cleanName = String(name || "").replace(/\s+/g, " ").trim();
      if (cleanName.length < 2 || cleanName.length > 60) return { ok: false, field: "name", error: "Please give a name between 2 and 60 characters." };
      if (!isThaiPhone(phone)) return { ok: false, field: "phone", error: "Please give a Thai phone number, for example 081-234-5678." };
      const { times } = await freeTimes(service, date);
      if (!times.includes(time)) {
        return { ok: false, field: "time", error: `${time || "That time"} isn't free for ${service.name} on ${formatDate(date)}.`, free_times: times };
      }

      const existing = new Set((await store.list()).map(b => b.code));
      const booking = {
        code: randomCode(existing),
        service_id: service.id, service: service.name, minutes: service.min, price_thb: service.price,
        date, time, end_time: toTime(toMinutes(time) + service.min),
        name: cleanName, phone: cleanPhone(phone),
        created_at: now().toISOString()
      };
      await store.add(booking);
      return { ok: true, booking: { ...booking, date_text: formatDate(date), price: baht(service.price) } };
    },

    // Cancelling needs the code AND the phone number, so nobody can cancel someone else's booking
    async cancelBooking({ code, phone }) {
      const all = await store.list();
      const booking = all.find(b => b.code === String(code || "").toUpperCase().trim());
      if (!booking || booking.phone !== cleanPhone(phone)) {
        return { ok: false, error: "No booking matches that code and phone number." };
      }
      if (booking.date < today().date) return { ok: false, error: "That booking is in the past." };
      await store.remove(booking.code);
      return { ok: true, cancelled: { code: booking.code, service: booking.service, date_text: formatDate(booking.date), time: booking.time } };
    }
  };
}

// A simple in-memory store (used by tests and as a fallback)
export function memoryStore(initial = []) {
  let items = [...initial];
  return {
    list: async () => [...items],
    add: async b => { items.push(b); },
    remove: async code => { items = items.filter(b => b.code !== code); }
  };
}
