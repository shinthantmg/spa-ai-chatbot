// ============================================================
// ai.js: AI mode. The AI never answers from its own memory:
// it calls "tools" (our front-desk functions) to get real data,
// and the instructions forbid guessing anything else.
// ============================================================
import { SPA } from "../js/core/spa-data.js";
import { DAY_NAMES, weekday, nowInBangkok, toTime } from "../js/core/dates.js";

export function systemPrompt(now = new Date()) {
  const { date, minutes } = nowInBangkok(now);
  return `You are the friendly booking assistant for ${SPA.name}, a day spa in Bangkok.
Today is ${DAY_NAMES[weekday(date)]} ${date}, and the time in Bangkok is ${toTime(minutes)}.

Rules:
- Only help with ${SPA.name}: treatments, prices, opening hours, location, policies, and booking or cancelling appointments. Politely refuse anything else.
- Never guess. Every price, service, opening time, free time and policy must come from a tool result in this conversation. If a tool doesn't give the answer, say you don't know and suggest calling ${SPA.phone}.
- Dates for tools are YYYY-MM-DD and times are HH:MM (24-hour). Work out dates like "tomorrow" or "next Friday" from today's date above.
- To book: find the exact service_id with list_services, check free times with check_availability, and collect the customer's full name and Thai phone number. Then repeat the details (service, date, time, price, name, phone) and ask the customer to confirm. Call create_booking ONLY after they clearly say yes.
- After booking, give the booking code and remind them to arrive 10 minutes early.
- To cancel, you need the booking code and the phone number used to book.
- Reply in the customer's language (English or Thai). Keep replies short and warm. Use plain text with no markdown tables.`;
}

// Tool definitions in OpenAI's "function calling" format
export const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_services",
      description: "List the spa's treatments with exact service_id, minutes and price in Thai baht.",
      parameters: {
        type: "object",
        properties: { category: { type: "string", enum: ["Massage", "Facial", "Body", "Nails", "Packages"], description: "Optional category filter" } },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_spa_info",
      description: "Opening hours, address, directions, contact details, payment methods, parking, cancellation policy and booking window.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "Free start times for one service on one date.",
      parameters: {
        type: "object",
        properties: {
          service_id: { type: "string", description: "Exact id from list_services, e.g. thai-60" },
          date: { type: "string", description: "YYYY-MM-DD" }
        },
        required: ["service_id", "date"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_booking",
      description: "Book an appointment. Only call after the customer has confirmed every detail.",
      parameters: {
        type: "object",
        properties: {
          service_id: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM, one of the free times" },
          name: { type: "string", description: "Customer's full name" },
          phone: { type: "string", description: "Thai phone number, e.g. 081-234-5678" }
        },
        required: ["service_id", "date", "time", "name", "phone"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "cancel_booking",
      description: "Cancel a booking using its code and the phone number it was made with.",
      parameters: {
        type: "object",
        properties: { code: { type: "string", description: "Booking code like LS7K2QXM" }, phone: { type: "string" } },
        required: ["code", "phone"],
        additionalProperties: false
      }
    }
  }
];

// Run one tool call against the front desk
export async function runTool(desk, name, args) {
  switch (name) {
    case "list_services": return desk.listServices(args.category);
    case "get_spa_info": return desk.spaInfo();
    case "check_availability": return desk.checkAvailability(args);
    case "create_booking": return desk.createBooking(args);
    case "cancel_booking": return desk.cancelBooking(args);
    default: return { ok: false, error: `Unknown tool ${name}` };
  }
}

// Keep only plain user/assistant text from the browser, so nobody can
// inject a fake "system" message or fake tool results.
export function cleanHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content.slice(0, 1000) }));
}

// The conversation loop: ask the model; if it wants tools, run them and ask again.
// callModel is injected, so tests can use a fake model with no API key.
export async function chat({ messages, desk, callModel, now = () => new Date(), maxSteps = 6 }) {
  const convo = [{ role: "system", content: systemPrompt(now()) }, ...cleanHistory(messages)];
  if (convo.length === 1 || convo.at(-1).role !== "user") throw Object.assign(new Error("The last message must be from the user."), { status: 400 });
  const toolsUsed = [];

  for (let step = 0; step < maxSteps; step++) {
    const message = await callModel({ messages: convo, tools: TOOLS });
    if (!message.tool_calls?.length) return { reply: (message.content || "").trim() || "Sorry, could you say that again?", toolsUsed };

    convo.push({ role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls });
    for (const call of message.tool_calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* bad JSON: tool will report missing fields */ }
      const result = await runTool(desk, call.function.name, args);
      toolsUsed.push(call.function.name);
      convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { reply: `Sorry, I couldn't finish that. Please try again or call us on ${SPA.phone}.`, toolsUsed };
}

// Calls the OpenAI Chat Completions API with fetch (no extra packages needed)
export function openAiModel({ apiKey, model, fetchImpl = fetch }) {
  return async ({ messages, tools }) => {
    const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, tools, temperature: 0.2 })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw Object.assign(new Error(`OpenAI error ${res.status}`), { status: 502, detail: detail.slice(0, 300) });
    }
    const data = await res.json();
    return data.choices[0].message;
  };
}
