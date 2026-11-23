// ============================================================
// dates.js: dates and times in Bangkok, and reading them from
// what customers type ("tomorrow", "next Friday", "25 Dec", "3pm").
// Dates are plain "YYYY-MM-DD" strings so they never shift by time zone.
// ============================================================

export const TZ = "Asia/Bangkok";
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = n => String(n).padStart(2, "0");
export const toMinutes = time => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
export const toTime = mins => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

// The current date and time in Bangkok, whatever the computer's own time zone is
export function nowInBangkok(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(date).map(p => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const weekday = iso => new Date(iso + "T00:00:00Z").getUTCDay();

function isRealDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// "2026-12-03" -> "Thursday 3 December"
export function formatDate(isoDate) {
  return new Date(isoDate + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC"
  });
}

// Find a date in a message. Returns "YYYY-MM-DD" or null.
export function parseDate(text, today) {
  const t = text.toLowerCase();

  if (/\bday after tomorrow\b/.test(t)) return addDays(today, 2);
  if (/\b(today|tonight|this evening|this afternoon)\b/.test(t)) return today;
  if (/\b(tomorrow|tmr|tmrw)\b/.test(t)) return addDays(today, 1);

  // 2026-12-25
  let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m && isRealDate(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);

  // 25/12 or 25/12/2026 (day first, as in Thailand)
  m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/);
  if (m) return withYear(+m[1], +m[2], m[3], today);

  // 25 Dec, 25th December, Dec 25
  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3})[a-z]*\b/) ;
  if (m && MONTHS.includes(m[2])) return withYear(+m[1], MONTHS.indexOf(m[2]) + 1, null, today);
  m = t.match(/\b([a-z]{3})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (m && MONTHS.includes(m[1])) return withYear(+m[2], MONTHS.indexOf(m[1]) + 1, null, today);

  // Monday ... Sunday (the next one, or today if it's that day)
  for (let i = 0; i < 7; i++) {
    const name = DAY_NAMES[i].toLowerCase();
    if (new RegExp(`\\b(${name}|${name.slice(0, 3)})\\b`).test(t)) {
      const ahead = (i - weekday(today) + 7) % 7;
      const next = /\bnext\s+\w*day\b/.test(t) && ahead === 0 ? 7 : ahead;
      return addDays(today, next);
    }
  }
  return null;
}

function withYear(d, mo, yearText, today) {
  let y;
  if (yearText) y = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
  else {
    y = Number(today.slice(0, 4));
    if (iso(y, mo, d) < today) y += 1; // "5 Jan" in December means next January
  }
  return isRealDate(y, mo, d) ? iso(y, mo, d) : null;
}

// Find a time in a message. Returns "HH:MM" or null.
// Understands 3pm, 3:30 pm, 15:00, 15.30, noon. A bare "3" is not a time.
export function parseTime(text) {
  const t = text.toLowerCase();
  if (/\bnoon\b|\bmidday\b/.test(t)) return "12:00";

  let m = t.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (m) return toClock(+m[1], +m[2], m[3]);
  m = t.match(/\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/);
  if (m) return toClock(+m[1], 0, m[2]);
  return null;
}

function toClock(h, min, ampm) {
  if (min > 59 || h > 23) return null;
  if (ampm) {
    const pm = ampm.startsWith("p");
    if (h > 12 || h === 0) return null;
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
  } else if (h >= 1 && h <= 9) {
    h += 12; // "3:30" at a spa open 10:00-21:00 means 15:30
  }
  return `${pad(h)}:${pad(min)}`;
}
