// ============================================================
// spa-data.js: everything the assistant is allowed to know.
// The demo engine and the AI both answer ONLY from this file
// (through booking.js), so prices and hours are never made up.
// Lotus Spa Bangkok is a made-up business; all details are sample data.
// ============================================================

export const SPA = {
  name: "Lotus Spa Bangkok",
  phone: "02-555-0123",
  email: "hello@lotusspa.example",
  line: "@lotusspa",
  address: "88 Sukhumvit Soi 24, Khlong Tan, Bangkok 10110",
  directions: "3 minutes' walk from BTS Phrom Phong, exit 2",
  openHour: 10,      // first appointment 10:00
  closeHour: 21,     // every treatment must end by 21:00
  openDays: "every day, including weekends",
  slotMinutes: 30,   // appointments start every 30 minutes
  therapists: 2,     // customers who can be served at the same time
  bookingDaysAhead: 60,
  payment: ["cash", "credit or debit card", "PromptPay QR"],
  parking: "Free parking for 6 cars behind the building. Tell the guard you're visiting Lotus Spa.",
  cancellation: "Free cancellation up to 2 hours before your appointment. You can cancel here with your booking code.",
  arrival: "Please arrive 10 minutes early so we can welcome you with tea.",
  health: "If you're pregnant or have an injury, please tell your therapist before the treatment. Some massages may be adjusted or not suitable."
};

// Each service: id, category, name, minutes, price (THB), description,
// and keywords the demo engine uses to recognise it in a message.
export const SERVICES = [
  { id: "thai-60",     cat: "Massage",  name: "Traditional Thai Massage",  min: 60,  price: 600,  desc: "Stretching and pressure-point massage done the classic Thai way, fully clothed.", keys: ["thai massage", "traditional thai", "thai"] },
  { id: "thai-90",     cat: "Massage",  name: "Traditional Thai Massage",  min: 90,  price: 850,  desc: "The longer version, with extra time for back, shoulders and legs.", keys: ["thai massage", "traditional thai", "thai"] },
  { id: "oil-60",      cat: "Massage",  name: "Aromatherapy Oil Massage",  min: 60,  price: 900,  desc: "Slow, relaxing massage with your choice of lemongrass, lavender or jasmine oil.", keys: ["aromatherapy", "oil massage", "oil"] },
  { id: "foot-45",     cat: "Massage",  name: "Foot Reflexology",          min: 45,  price: 450,  desc: "Pressure-point foot massage that helps tired legs after a long day.", keys: ["foot massage", "reflexology", "foot", "feet"] },
  { id: "hotstone-90", cat: "Massage",  name: "Hot Stone Massage",         min: 90,  price: 1400, desc: "Warm basalt stones melt deep muscle tension.", keys: ["hot stone", "stone"] },
  { id: "facial-60",   cat: "Facial",   name: "Hydrating Facial",          min: 60,  price: 1100, desc: "Cleanse, exfoliate and a deep moisture mask for dry or tired skin.", keys: ["hydrating facial", "hydrating", "moisture"] },
  { id: "facial-75",   cat: "Facial",   name: "Brightening Facial",        min: 75,  price: 1500, desc: "Vitamin C treatment for dull skin and uneven tone.", keys: ["brightening facial", "brightening", "vitamin c"] },
  { id: "scrub-45",    cat: "Body",     name: "Coconut Body Scrub",        min: 45,  price: 800,  desc: "Natural coconut and rice scrub that leaves skin soft and smooth.", keys: ["body scrub", "coconut", "scrub"] },
  { id: "wrap-60",     cat: "Body",     name: "Herbal Body Wrap",          min: 60,  price: 1000, desc: "Thai herbs and warm towels to detox and relax the whole body.", keys: ["body wrap", "herbal", "wrap"] },
  { id: "mani-45",     cat: "Nails",    name: "Classic Manicure",          min: 45,  price: 400,  desc: "Shape, cuticle care and polish.", keys: ["manicure", "hand nails"] },
  { id: "pedi-60",     cat: "Nails",    name: "Spa Pedicure",              min: 60,  price: 550,  desc: "Foot soak, scrub, massage and polish.", keys: ["pedicure"] },
  { id: "pkg-150",     cat: "Packages", name: "Lotus Half-Day Package",    min: 150, price: 2600, desc: "Body scrub, 90-minute oil massage and a hydrating mini facial.", keys: ["half-day", "half day", "package", "lotus package"] }
];

export const CATEGORIES = [...new Set(SERVICES.map(s => s.cat))];

export const baht = n => "฿" + n.toLocaleString("en-US");
