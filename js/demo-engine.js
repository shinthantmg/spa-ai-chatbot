// ============================================================
// demo-engine.js: the chatbot's "demo mode". It works without an
// AI key by recognising what the customer wants (intents) and
// filling in a booking step by step (slot filling).
// Every answer comes from the front desk, never from made-up text.
// ============================================================
import { SPA, SERVICES, CATEGORIES, baht } from "./core/spa-data.js";
import { findServices, getService, isThaiPhone } from "./core/booking.js";
import { parseDate, parseTime, formatDate } from "./core/dates.js";

const has = (text, ...words) => words.some(w => new RegExp(`\\b${w}\\b`, "i").test(text));
const YES = /^(yes|yeah|yep|yup|sure|ok|okay|confirm|correct|please do|go ahead|book it|ใช่|ค่ะ|ครับ)\b/i;
const NO = /^(no|nope|nah|not now|cancel that|wrong)\b/i;
const STOP = /\b(stop|never ?mind|forget it|start over|restart)\b/i;
const CODE_RE = /\bLS[A-Z0-9]{6}\b/i;

const MAIN_CHIPS = ["Prices", "Opening hours", "Book a massage", "Where are you?"];
// "facials", "nails", "massage" -> the category name, or undefined
const categoryIn = text => CATEGORIES.find(c => {
  const word = c.toLowerCase().replace(/s$/, "");
  return new RegExp(`\\b${word}(s|es)?\\b`, "i").test(text) || (c === "Nails" && /\bnail/i.test(text));
});
const BOOK_WORDS = /\b(book|booking|appointment|reserve|reservation)\b/i;
const serviceLine = s => `• ${s.name} (${s.min} min): ${baht(s.price)}`;

export function createDemoEngine(desk) {
  // What the conversation is in the middle of
  let flow = null;          // null | "booking" | "cancel"
  let draft = {};           // booking details collected so far
  let awaiting = null;      // which detail we just asked for
  let offeredService = null;// last service we described ("Want to book it?")

  const reply = (text, chips = []) => ({ text, chips });

  function resetFlow() { flow = null; draft = {}; awaiting = null; }

  // ---------- Booking, one detail at a time ----------
  async function continueBooking(message) {
    const today = desk.today();

    // After "No, change something": clear the detail they want to change
    if (awaiting === "change") {
      awaiting = null;
      if (has(message, "treatment", "service", "massage")) { draft.serviceId = null; draft.time = null; }
      if (has(message, "day", "date")) { draft.date = null; draft.time = null; }
      if (has(message, "time")) draft.time = null;
      if (has(message, "name")) draft.name = null;
      if (has(message, "phone", "number")) draft.phone = null;
    }

    // Pick up anything useful the customer wrote, whatever we asked
    const services = findServices(message);
    if (services.length === 1) draft.serviceId = services[0].id;
    else if (services.length > 1 && !draft.serviceId) draft.options = services.map(s => s.id);
    else if (!services.length && !draft.serviceId && categoryIn(message)) {
      const inCategory = SERVICES.filter(s => s.cat === categoryIn(message));
      if (inCategory.length === 1) draft.serviceId = inCategory[0].id;
      else draft.options = inCategory.map(s => s.id);
    }
    if (draft.options && awaiting === "service") {
      const m = message.match(/\b(\d{2,3})\b/);
      const pick = m && draft.options.map(getService).find(s => s.min === Number(m[1]));
      if (pick) draft.serviceId = pick.id;
    }
    const date = parseDate(message, today);
    if (date) { draft.date = date; if (!parseTime(message)) draft.time = null; }
    const time = parseTime(message);
    if (time) draft.time = time;
    if (awaiting === "name" && !date && !time && !services.length) draft.name = message.trim();
    if (awaiting === "phone") {
      if (!isThaiPhone(message)) return reply("That doesn't look like a Thai phone number. Please type it like 081-234-5678.");
      draft.phone = message.trim();
    }

    // 1. Which treatment?
    if (!draft.serviceId) {
      awaiting = "service";
      if (draft.options) {
        const opts = draft.options.map(getService);
        return reply(`Which one would you like?\n${opts.map(serviceLine).join("\n")}`, opts.map(s => `${s.min} min`));
      }
      return reply("Which treatment would you like to book?", ["Thai massage", "Oil massage", "Foot reflexology", "Hydrating facial"]);
    }
    delete draft.options;
    const service = getService(draft.serviceId);

    // 2. Which day?
    if (!draft.date) {
      awaiting = "date";
      return reply(`Great, ${service.name} (${service.min} min, ${baht(service.price)}). Which day would you like to come?`, ["Today", "Tomorrow", "This Saturday"]);
    }

    // 3. Which time? (only free times are offered)
    const avail = await desk.checkAvailability({ service_id: service.id, date: draft.date });
    if (!avail.ok) { draft.date = null; awaiting = "date"; return reply(`${avail.error} Which other day would suit you?`, ["Tomorrow", "Next Monday"]); }
    if (!avail.free_times.length) {
      draft.date = null; awaiting = "date";
      return reply(`Sorry, ${avail.note === "No more times today." ? "there are no more times today" : `${avail.date_text} is fully booked`} for ${service.name}. Which other day would suit you?`, ["Tomorrow", "Next Monday"]);
    }
    if (!draft.time || !avail.free_times.includes(draft.time)) {
      const wasTaken = draft.time;
      draft.time = null; awaiting = "time";
      const list = avail.free_times;
      const shown = list.length > 8 ? [...list.slice(0, 4), ...list.slice(-4)] : list;
      return reply(
        `${wasTaken ? `Sorry, ${wasTaken} isn't free. ` : ""}Free times on ${avail.date_text}: ${list.join(", ")}.\nWhat time would you like?`,
        shown
      );
    }

    // 4. Name and phone
    if (!draft.name) { awaiting = "name"; return reply(`${draft.time} on ${formatDate(draft.date)} is free. What's your full name?`); }
    if (!draft.phone) { awaiting = "phone"; return reply(`Thanks, ${draft.name}. What's your phone number? We'll only use it about this booking.`); }

    // 5. Confirm
    if (awaiting !== "confirm") {
      awaiting = "confirm";
      return reply(
        `Please check your booking:\n• ${service.name} (${service.min} min), ${baht(service.price)}\n• ${formatDate(draft.date)} at ${draft.time}\n• ${draft.name}, ${draft.phone}\nShall I book it?`,
        ["Yes, book it", "No, change something"]
      );
    }
    if (YES.test(message.trim())) {
      const result = await desk.createBooking({ service_id: service.id, date: draft.date, time: draft.time, name: draft.name, phone: draft.phone });
      if (!result.ok) {
        draft[result.field] = null; awaiting = null;
        if (result.field === "phone") { awaiting = "phone"; return reply(`${result.error} What's your phone number?`); }
        if (result.field === "name") { awaiting = "name"; return reply(`${result.error} What's your full name?`); }
        return continueBooking("");
      }
      const b = result.booking;
      resetFlow();
      return reply(
        `You're booked! ✅\n${b.service}, ${b.date_text} at ${b.time} (until ${b.end_time}), ${b.price}.\nYour booking code is ${b.code}. Keep it to cancel or change your booking. ${SPA.arrival}`,
        ["Opening hours", "How do I get there?", "Book another"]
      );
    }
    if (NO.test(message.trim())) {
      awaiting = "change";
      return reply("No problem. What would you like to change: the treatment, day, time, name or phone?", ["Treatment", "Day", "Time", "Name", "Phone"]);
    }
    // "Make it 4pm instead" already updated the details above, so show the summary again
    awaiting = null;
    return continueBooking("");
  }

  // ---------- Cancelling ----------
  async function continueCancel(message) {
    const code = message.match(CODE_RE);
    if (code) draft.code = code[0].toUpperCase();
    else if (awaiting === "phone") draft.phone = message.trim();

    if (!draft.code) { awaiting = "code"; return reply("Sure. What's your booking code? It starts with LS, for example LS7K2QXM."); }
    if (!draft.phone) { awaiting = "phone"; return reply("And the phone number you booked with?"); }
    const result = await desk.cancelBooking({ code: draft.code, phone: draft.phone });
    resetFlow();
    if (!result.ok) return reply(`${result.error} Please check them, or call us on ${SPA.phone}.`, ["Cancel a booking", "Book a massage"]);
    const c = result.cancelled;
    return reply(`Done. Your ${c.service} on ${c.date_text} at ${c.time} is cancelled.`, ["Book a massage", "Prices"]);
  }

  // ---------- Answering questions ----------
  function describe(services) {
    if (services.length === 1) {
      const s = services[0];
      offeredService = s.id;
      return reply(`${s.name}: ${s.min} minutes, ${baht(s.price)}.\n${s.desc}\nWould you like to book it?`, [`Book ${s.name} (${s.min} min)`, "Other treatments"]);
    }
    offeredService = null;
    return reply(`We have:\n${services.map(serviceLine).join("\n")}\nWhich one would you like?`, services.map(s => `${s.name} (${s.min} min)`));
  }

  function menu(category) {
    if (category) return describe(SERVICES.filter(s => s.cat === category));
    const cheapest = cat => Math.min(...SERVICES.filter(s => s.cat === cat).map(s => s.price));
    return reply(
      `Here's our menu (prices in Thai baht):\n${CATEGORIES.map(c => `• ${c}: from ${baht(cheapest(c))}`).join("\n")}\nWhich would you like to see?`,
      CATEGORIES
    );
  }

  async function answer(message) {
    const t = message.toLowerCase();
    const services = findServices(message);
    const category = categoryIn(t);
    const wantsBooking = BOOK_WORDS.test(t) || /\bcan i come\b/.test(t);

    if (has(t, "cancel") || CODE_RE.test(message)) { flow = "cancel"; draft = {}; return continueCancel(message); }

    if (wantsBooking) {
      flow = "booking"; draft = {}; awaiting = null;
      if (!services.length && offeredService && has(t, "it", "this", "that")) draft.serviceId = offeredService;
      return continueBooking(message);
    }
    if (offeredService && YES.test(message.trim())) {
      flow = "booking"; draft = { serviceId: offeredService }; awaiting = null;
      return continueBooking("");
    }

    if (has(t, "available", "availability", "free", "slots?") || /\bwhat times?\b/.test(t)) {
      flow = "booking"; draft = {}; awaiting = null;
      return continueBooking(message);
    }

    if (has(t, "open", "opening", "close", "closing", "hours") || /\bwhat time do you\b/.test(t)) {
      const date = parseDate(message, desk.today());
      const day = date ? `${formatDate(date).split(" ")[0]}: ` : "";
      return reply(`${day}We're open ${SPA.openHour}:00 to ${SPA.closeHour}:00, ${SPA.openDays}. Every treatment must finish by ${SPA.closeHour}:00, so the last 60-minute massage starts at ${SPA.closeHour - 1}:00.`, ["Book a massage", "Where are you?"]);
    }
    if (has(t, "where", "address", "location", "located", "bts", "directions", "get there", "map")) {
      return reply(`We're at ${SPA.address}, ${SPA.directions}.`, ["Parking", "Opening hours"]);
    }
    if (has(t, "parking", "park", "car")) return reply(SPA.parking, ["Where are you?"]);
    if (has(t, "pay", "payment", "card", "cash", "promptpay", "credit")) return reply(`You pay at the spa after your treatment. We accept ${SPA.payment.join(", ")}.`);
    if (has(t, "phone", "call", "contact", "email", "line")) return reply(`Phone ${SPA.phone}, LINE ${SPA.line}, email ${SPA.email}.`);
    if (has(t, "pregnant", "pregnancy", "injury", "injured", "pain")) return reply(SPA.health, ["Book a massage"]);
    if (has(t, "late", "early", "arrive", "policy")) return reply(`${SPA.arrival} ${SPA.cancellation}`);

    if (services.length) return describe(services);
    if (category) return menu(category);
    if (has(t, "price", "prices", "cost", "how much", "menu", "services", "treatments", "list")) return menu();

    if (has(t, "hi", "hello", "hey", "sawasdee", "good morning", "good afternoon", "good evening") || /สวัสดี/.test(message)) {
      return reply(`Hello! 👋 I'm the ${SPA.name} assistant. I can tell you about treatments and prices, opening hours and how to find us, and I can book or cancel an appointment for you.`, MAIN_CHIPS);
    }
    if (has(t, "thanks", "thank you", "thx")) return reply("You're welcome! Anything else I can help with?", MAIN_CHIPS);

    return reply(`Sorry, I can only help with ${SPA.name}: treatments and prices, opening hours, location, and booking or cancelling an appointment. For anything else please call ${SPA.phone}.`, MAIN_CHIPS);
  }

  return {
    async reply(message) {
      const text = String(message || "").slice(0, 500).trim();
      if (!text) return reply("Please type a message.", MAIN_CHIPS);
      if (flow && STOP.test(text)) { resetFlow(); return reply("Okay, I've stopped. What else can I help with?", MAIN_CHIPS); }

      // In the middle of a booking, a new question (prices, hours...) is answered without losing the booking
      if (flow === "booking") {
        const t = text.toLowerCase();
        // "Book a facial..." in the middle of another booking starts a new one
        if (BOOK_WORDS.test(t) && awaiting !== "name" && awaiting !== "confirm") { resetFlow(); return answer(text); }
        const freeText = awaiting === "name" || awaiting === "phone" || awaiting === "confirm" || awaiting === "change";
        const infoQuestion = has(t, "open", "hours", "close", "where", "address", "parking", "pay", "payment", "price", "prices", "menu", "cost", "how much");
        const sideQuestion = !freeText && !findServices(text).length && !parseTime(text) &&
          (infoQuestion || (/\?$/.test(text) && !parseDate(text, desk.today())));
        if (sideQuestion) {
          const saved = { flow, draft: { ...draft }, awaiting };
          const r = await answer(text);
          ({ flow, awaiting } = saved); draft = saved.draft;
          return reply(`${r.text}\n\n(We were in the middle of your booking. Just carry on when you're ready.)`, r.chips);
        }
        return continueBooking(text);
      }
      if (flow === "cancel") return continueCancel(text);
      return answer(text);
    },
    reset() { resetFlow(); offeredService = null; }
  };
}
