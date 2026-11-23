// ============================================================
// chat-widget.js: the chat window customers see.
//
// It picks a mode automatically:
//   AI mode   - when the page is served by our server (server/server.js)
//               and an OpenAI key is set. Messages go to /api/chat.
//   Demo mode - everywhere else (for example GitHub Pages). The
//               rule-based engine in demo-engine.js answers in the browser.
//
// Use it inline:   <div id="chat-root"></div>  (the widget fills it)
// or floating:     no #chat-root on the page -> a chat bubble appears bottom-right
// ============================================================
import { createFrontDesk } from "./core/booking.js";
import { createDemoEngine } from "./demo-engine.js";
import { SPA } from "./core/spa-data.js";

const WELCOME = {
  text: `Hi! 👋 I'm the ${SPA.name} assistant. Ask me about treatments, prices and opening hours, or book an appointment.`,
  chips: ["Prices", "Opening hours", "Book a massage", "Where are you?"]
};

// Demo-mode bookings are kept in this browser only
function browserStore(key = "lotus-chat-bookings") {
  let memory = [];
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return memory; } };
  const write = list => { memory = list; try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* storage blocked */ } };
  return {
    list: async () => read(),
    add: async b => write([...read(), b]),
    remove: async code => write(read().filter(b => b.code !== code))
  };
}

// Ask our server whether AI mode is available (it isn't on GitHub Pages)
async function detectMode() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch("api/health", { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return "demo";
    const data = await res.json();
    return data.ai ? "ai" : "demo";
  } catch {
    return "demo";
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text; // always textContent: customer text can never become HTML
  return node;
}

export async function mountChat({ root = document.getElementById("chat-root") } = {}) {
  const floating = !root;
  if (floating) {
    root = el("div", "chat-float");
    document.body.append(root);
  }

  // ---------- Build the window ----------
  const panel = el("section", "chat");
  panel.setAttribute("aria-label", `${SPA.name} assistant`);
  panel.innerHTML = `
    <header class="chat-head">
      <span class="chat-avatar" aria-hidden="true">
        <svg viewBox="0 0 40 40"><path d="M20 7c4 5 4 12 0 19-4-7-4-14 0-19z" fill="#fff"/><path d="M20 26c-2-7-7-11-13-12 0 7 5 12 13 12zM20 26c2-7 7-11 13-12 0 7-5 12-13 12z" fill="#cfe3d5"/></svg>
      </span>
      <div class="chat-title"><strong>Lotus Spa assistant</strong><span class="chat-mode" id="chat-mode">Connecting…</span></div>
      <button type="button" class="chat-icon" id="chat-reset" aria-label="Start a new conversation" title="Start again">↺</button>
      ${floating ? '<button type="button" class="chat-icon" id="chat-close" aria-label="Close chat">✕</button>' : ""}
    </header>
    <div class="chat-log" id="chat-log" role="log" aria-live="polite"></div>
    <div class="chat-chips" id="chat-chips"></div>
    <form class="chat-form" id="chat-form">
      <label class="sr-only" for="chat-input">Your message</label>
      <input id="chat-input" autocomplete="off" maxlength="500" placeholder="Type a message…">
      <button type="submit" class="chat-send" aria-label="Send">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8z" fill="currentColor"/></svg>
      </button>
    </form>`;
  root.append(panel);

  const log = panel.querySelector("#chat-log");
  const chipsBox = panel.querySelector("#chat-chips");
  const form = panel.querySelector("#chat-form");
  const input = panel.querySelector("#chat-input");
  const modeLabel = panel.querySelector("#chat-mode");

  if (floating) {
    const launcher = el("button", "chat-launcher");
    launcher.type = "button";
    launcher.setAttribute("aria-label", "Chat with Lotus Spa");
    launcher.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H8l-4 4z" fill="currentColor"/></svg>';
    root.append(launcher);
    const toggle = open => { root.classList.toggle("open", open); if (open) input.focus(); };
    launcher.addEventListener("click", () => toggle(!root.classList.contains("open")));
    panel.querySelector("#chat-close").addEventListener("click", () => toggle(false));
  }

  // ---------- Pick the mode ----------
  const mode = await detectMode();
  const desk = createFrontDesk({ store: browserStore() });
  const demo = createDemoEngine(desk);
  let history = []; // AI mode: the conversation sent to the server
  modeLabel.textContent = mode === "ai" ? "AI mode · answers from spa data" : "Demo mode · works without an AI key";
  panel.dataset.mode = mode;

  // ---------- Messages ----------
  function addMessage(role, text) {
    const bubble = el("div", `msg ${role}`);
    text.split("\n").forEach((line, i) => {
      if (i) bubble.append(el("br"));
      bubble.append(document.createTextNode(line));
    });
    log.append(bubble);
    log.scrollTop = log.scrollHeight;
  }

  function showChips(chips = []) {
    chipsBox.replaceChildren(...chips.map(label => {
      const b = el("button", "chip", label);
      b.type = "button";
      b.addEventListener("click", () => send(label));
      return b;
    }));
  }

  function typing(on) {
    log.querySelector(".typing")?.remove();
    if (on) {
      const t = el("div", "msg bot typing");
      t.setAttribute("aria-label", "Assistant is typing");
      t.innerHTML = "<span></span><span></span><span></span>";
      log.append(t);
      log.scrollTop = log.scrollHeight;
    }
  }

  async function askServer(text) {
    history.push({ role: "user", content: text });
    const res = await fetch("api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-20) })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "The assistant is unavailable right now.");
    history.push({ role: "assistant", content: data.reply });
    return { text: data.reply, chips: [] };
  }

  let busy = false;
  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    input.value = "";
    showChips();
    addMessage("user", text);
    typing(true);
    try {
      const [answer] = await Promise.all([
        mode === "ai" ? askServer(text) : demo.reply(text),
        new Promise(r => setTimeout(r, mode === "ai" ? 0 : 350)) // a short pause feels more natural
      ]);
      typing(false);
      addMessage("bot", answer.text);
      showChips(answer.chips);
    } catch (err) {
      typing(false);
      addMessage("bot error", `${err.message} You can also call us on ${SPA.phone}.`);
    } finally {
      busy = false;
      input.focus({ preventScroll: true });
    }
  }

  function start() {
    log.replaceChildren();
    history = [];
    demo.reset();
    addMessage("bot", WELCOME.text);
    showChips(WELCOME.chips);
  }

  form.addEventListener("submit", e => { e.preventDefault(); send(input.value); });
  panel.querySelector("#chat-reset").addEventListener("click", start);
  start();

  // Let the page send example questions into the chat
  return { send, mode };
}
