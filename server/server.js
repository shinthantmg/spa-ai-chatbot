// ============================================================
// server.js: serves the website and the AI chat API.
// Uses only Node.js built-in modules, so there's nothing to install.
//
//   node server/server.js        then open http://localhost:3000
//
// Without OPENAI_API_KEY the site still works in demo mode.
// ============================================================
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createFrontDesk } from "../js/core/booking.js";
import { chat, openAiModel } from "./ai.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(join(ROOT, ".env"));

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const BOOKINGS_FILE = join(ROOT, "data", "bookings.json");

// Only these folders are public. .env, data/ and server/ are never served.
const PUBLIC = ["index.html", "css", "js"];
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

// Minimal .env reader: KEY=value lines, # comments
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// Bookings saved to data/bookings.json
export function fileStore(path) {
  const read = async () => { try { return JSON.parse(await readFile(path, "utf8")); } catch { return []; } };
  const write = async list => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(list, null, 2)); };
  return {
    list: read,
    add: async b => write([...(await read()), b]),
    remove: async code => write((await read()).filter(b => b.code !== code))
  };
}

// At most 20 chat messages per minute from one IP address, to protect the API key's budget
function rateLimiter({ limit = 20, windowMs = 60_000 } = {}) {
  const hits = new Map();
  return ip => {
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter(t => now - t < windowMs);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length <= limit;
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req, maxBytes = 32_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("Message too large."), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("Invalid JSON."), { status: 400 }); }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let path = decodeURIComponent(url.pathname);
  if (path === "/") path = "/index.html";
  const file = normalize(join(ROOT, path));
  const relative = file.slice(ROOT.length + 1);
  const allowed = file.startsWith(ROOT + sep) && PUBLIC.some(p => relative === p || relative.startsWith(p + sep));
  if (!allowed) return sendJson(res, 404, { error: "Not found" });
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

export function createApp({ apiKey = API_KEY, callModel, store = fileStore(BOOKINGS_FILE), now = () => new Date() } = {}) {
  const desk = createFrontDesk({ store, now });
  const model = callModel || (apiKey ? openAiModel({ apiKey, model: MODEL }) : null);
  const allow = rateLimiter();

  return createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    try {
      if (pathname === "/api/health" && req.method === "GET") {
        return sendJson(res, 200, { ok: true, ai: Boolean(model) });
      }
      if (pathname === "/api/chat") {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });
        if (!model) return sendJson(res, 503, { error: "AI mode is off because no OPENAI_API_KEY is set." });
        if (!allow(req.socket.remoteAddress)) return sendJson(res, 429, { error: "Too many messages. Please wait a minute." });
        const body = await readJsonBody(req);
        const result = await chat({ messages: body.messages, desk, callModel: model, now });
        return sendJson(res, 200, result);
      }
      if (req.method === "GET") return serveStatic(req, res);
      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      if (err.status && err.status < 500) return sendJson(res, err.status, { error: err.message });
      console.error(err.message, err.detail || "");
      sendJson(res, 502, { error: "The assistant is unavailable right now." });
    }
  });
}

// Start the server when this file is run directly (not when imported by tests)
if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  createApp().listen(PORT, () => {
    console.log(`Lotus Spa assistant running at http://localhost:${PORT}`);
    console.log(API_KEY ? `AI mode is ON (model: ${MODEL})` : "AI mode is OFF: no OPENAI_API_KEY, so the page uses demo mode");
  });
}
