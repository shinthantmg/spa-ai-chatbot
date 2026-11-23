# Lotus Spa AI Assistant: Booking Chatbot

[![Tests](https://github.com/shinthantmg/spa-ai-chatbot/actions/workflows/tests.yml/badge.svg)](https://github.com/shinthantmg/spa-ai-chatbot/actions/workflows/tests.yml)

A chatbot for a day spa that answers customers' questions **only from the spa's real data** and **books appointments inside the chat**. It runs in two modes: a free demo mode that works in any browser, and an AI mode that uses OpenAI with function calling (tools).

**Live demo (demo mode):** https://shinthantmg.github.io/spa-ai-chatbot/

Built by **Shin Thant Maung** (ICT, Rangsit University) as a portfolio project.

> Lotus Spa Bangkok is a made-up business. All prices, addresses and phone numbers are sample data.

## What it can do

- Answer questions about **treatments and prices**, **opening hours**, **location and directions**, **parking**, **payment** and **policies**
- **Check real free times** for a treatment on any day, from today up to 60 days ahead
- **Book an appointment** step by step: treatment → day → time → name → phone → confirm. It understands messages like *"Book a 60 minute Thai massage tomorrow at 5pm"* in one go.
- **Cancel a booking** with the booking code and the phone number used to book
- Answer a side question in the middle of a booking ("where are you?") without losing the booking
- Politely **refuse anything off-topic** instead of guessing

## How it works

```
               ┌───────────────────────────── browser ─────────────────────────────┐
 customer ───▶ │ chat-widget.js ──┬──▶ demo-engine.js (no AI key) ──┐              │
               │                  │                                ├─▶ front desk │
               │                  └──▶ POST /api/chat ──┐          │   booking.js │
               └────────────────────────────────────────┼──────────┼──────────────┘
                                                        ▼          │   (prices, hours,
                                      server/server.js + ai.js     │    free times,
                                      OpenAI + 5 tools ────────────┘    booking rules)
```

Both modes answer through the same **front desk** (`js/core/booking.js`), which reads `js/core/spa-data.js` and the booking calendar. That's why the chatbot can't invent a price or offer a time that's already taken.

### Demo mode (GitHub Pages)
A rule-based engine in the browser:
- **Intent detection:** recognises whether the customer wants prices, hours, location, booking or cancelling.
- **Slot filling:** collects the treatment, date, time, name and phone, and asks only for what's missing.
- **Date and time understanding:** "tomorrow", "next Friday", "25 Dec", "10/1", "3:30pm" and "noon", always in Bangkok time.
- Bookings are saved in the browser's localStorage.

### AI mode (Node.js server + OpenAI)
The server sends the conversation to OpenAI with **five tools** the AI can call:

| Tool | What it does |
|---|---|
| `list_services` | Treatments with exact ids, lengths and prices |
| `get_spa_info` | Hours, address, contact, payment, parking, policies |
| `check_availability` | Free start times for a service on a date |
| `create_booking` | Books after re-checking the time, name and Thai phone number |
| `cancel_booking` | Cancels only with the right code **and** phone number |

The system prompt gives the AI today's date in Bangkok and tells it never to guess: every fact must come from a tool result, and it must get a clear "yes" before booking.

### Security
- **The API key stays on the server.** It's read from `.env` (which is in `.gitignore`) and never sent to the browser.
- **The server serves only public files.** Requests for `.env`, `server/` or `data/bookings.json` return 404, which is covered by a test.
- **The browser can't inject instructions.** Only plain user and assistant text is accepted from the browser, so fake "system" messages or fake tool results are dropped.
- **Abuse limits:** 20 messages per minute per IP, a 32 KB request limit and 1,000 characters per message.
- **The front desk checks the AI's input.** Every tool call is validated (dates, times, phone numbers, availability), so a mistake by the AI can't create a bad booking.
- **No HTML injection.** All chat text is shown with `textContent`, so a message containing HTML is displayed, never run.

## Run it on your computer

Requires [Node.js](https://nodejs.org) 20 or newer. The server uses **only Node's built-in modules**, so there's nothing to install for the app itself.

```bash
git clone https://github.com/shinthantmg/spa-ai-chatbot.git
cd spa-ai-chatbot
npm start
```

Open http://localhost:3000. Without a key it runs in demo mode.

### Turn on AI mode
1. Get an API key at https://platform.openai.com/api-keys. Using it costs a small amount per message.
2. Copy `.env.example` to `.env` and paste your key after `OPENAI_API_KEY=`.
3. Run `npm start` again. The chat header will say **AI mode**.

## Tests

| Type | Tool | What's covered |
|---|---|---|
| **31 unit tests** | Node's built-in test runner | Date and time understanding, booking rules and therapist capacity, the demo conversation, the AI tool loop with a **fake model** (no key needed), server security |
| **8 browser tests × 2 devices** | Playwright | Booking and cancelling in the real chat window, suggestion chips, the floating bubble, HTML injection, phone layout |

```bash
npm test                      # unit tests
npm install                   # installs Playwright (only needed for browser tests)
npx playwright install chromium
npm run test:e2e              # browser tests
```

GitHub Actions runs both on every push (see the badge at the top).

## Project structure

```
spa-ai-chatbot/
├── index.html               Demo page with the chat and "How it works"
├── css/chat.css             Chat window styles (inline or floating bubble)
├── js/
│   ├── chat-widget.js       The chat window; picks AI or demo mode
│   ├── demo-engine.js       Rule-based assistant (intents + slot filling)
│   └── core/
│       ├── spa-data.js      Services, prices, hours, policies (the only source of facts)
│       ├── dates.js         Bangkok time; reading dates and times from messages
│       └── booking.js       Front desk: services, free times, booking, cancelling
├── server/
│   ├── server.js            Web server + /api/health + /api/chat (no dependencies)
│   └── ai.js                System prompt, tools and the OpenAI tool-calling loop
├── tests/
│   ├── unit/                node:test unit tests
│   └── e2e/                 Playwright browser tests
└── .github/workflows/tests.yml
```

## Add it to another website

On a page without `<div id="chat-root">`, the widget appears as a **floating chat bubble** in the corner:

```html
<link rel="stylesheet" href="css/chat.css">
<script type="module">
  import { mountChat } from "./js/chat-widget.js";
  mountChat();
</script>
```

## Limits and next steps

- AI-mode bookings are saved in a JSON file, which is fine for a demo. A real spa would use a database so that two simultaneous bookings can't take the same last place.
- [ ] Connect to the [Lotus Spa booking website](https://github.com/shinthantmg/spa-salon-booking) so both share one calendar
- [ ] LINE Official Account integration (LINE Messaging API)
- [ ] Thai language in demo mode
