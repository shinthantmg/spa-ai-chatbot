// End-to-end tests: a real browser uses the chat like a customer would.
import { test as base, expect } from "@playwright/test";

// Every test runs on Wednesday 2 December 2026 at 10:05 in Bangkok,
// with Google Fonts blocked so tests are fast and never wait on the network.
const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
    await page.clock.setFixedTime(new Date("2026-12-02T10:05:00+07:00"));
    await page.goto("/");
    await expect(page.locator("#chat-mode")).toContainText("Demo mode");
    await use(page);
  }
});

const lastBot = page => page.locator(".msg.bot:not(.typing)").last();

async function say(page, text) {
  const count = await page.locator(".msg.bot:not(.typing)").count();
  await page.getByLabel("Your message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".msg.bot:not(.typing)")).toHaveCount(count + 1);
  return lastBot(page);
}

test("opens with a welcome message and suggestions", async ({ page }) => {
  await expect(lastBot(page)).toContainText("I'm the Lotus Spa Bangkok assistant");
  await expect(page.locator(".chip")).toHaveText(["Prices", "Opening hours", "Book a massage", "Where are you?"]);
  await expect(page.locator("#mode-note")).toContainText("demo mode");
});

test("suggestion chips and example questions send messages", async ({ page }) => {
  await page.locator(".chip", { hasText: "Prices" }).click();
  await expect(lastBot(page)).toContainText("Massage: from ฿450");

  await page.getByRole("button", { name: "How much is a hot stone massage?" }).click();
  await expect(lastBot(page)).toContainText("Hot Stone Massage: 90 minutes, ฿1,400");
});

test("a customer can book an appointment in the chat", async ({ page }) => {
  await say(page, "Book a 60 minute Thai massage tomorrow");
  await expect(lastBot(page)).toContainText("Free times on Thursday 3 December");

  // Click the first free time offered
  const firstTime = page.locator(".chip").first();
  const time = await firstTime.textContent();
  await firstTime.click();
  await expect(lastBot(page)).toContainText(`${time} on Thursday 3 December is free`);

  await say(page, "Malee Jaidee");
  await say(page, "081-234-5678");
  await expect(lastBot(page)).toContainText("Please check your booking");
  await page.locator(".chip", { hasText: "Yes, book it" }).click();
  await expect(lastBot(page)).toContainText("You're booked!");
  const code = (await lastBot(page).textContent()).match(/LS[A-Z2-9]{6}/)[0];

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lotus-chat-bookings")));
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ code, service_id: "thai-60", date: "2026-12-03", time, name: "Malee Jaidee" });
});

test("a booking can be cancelled after reloading the page", async ({ page }) => {
  await say(page, "book a foot massage tomorrow");
  await page.locator(".chip").first().click();
  await expect(lastBot(page)).toContainText("What's your full name?");
  await say(page, "Somsak Phromma");
  await say(page, "0823456789");
  await say(page, "yes");
  const code = (await lastBot(page).textContent()).match(/LS[A-Z2-9]{6}/)[0];

  await page.reload();
  await expect(page.locator("#chat-mode")).toContainText("Demo mode");
  await say(page, "cancel my booking");
  await say(page, code);
  await expect(await say(page, "0823456789")).toContainText("is cancelled");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("lotus-chat-bookings")))).toEqual([]);
});

test("the restart button starts a new conversation", async ({ page }) => {
  await say(page, "where are you?");
  await page.getByRole("button", { name: "Start a new conversation" }).click();
  await expect(page.locator(".msg")).toHaveCount(1);
  await expect(lastBot(page)).toContainText("I'm the Lotus Spa Bangkok assistant");
});

test("messages are shown as text, never run as HTML", async ({ page }) => {
  await say(page, '<img src=x id="injected" onerror="window.hacked=1">');
  await expect(page.locator("#injected")).toHaveCount(0);
  expect(await page.evaluate(() => window.hacked)).toBeUndefined();
  await expect(page.locator(".msg.user").last()).toHaveText('<img src=x id="injected" onerror="window.hacked=1">');
});

test("the floating chat bubble opens and works", async ({ page }) => {
  // Mount a second, floating copy the way another website would use it
  await page.evaluate(async () => {
    document.getElementById("chat-root").remove();
    const { mountChat } = await import("/js/chat-widget.js");
    await mountChat();
  });
  const launcher = page.getByRole("button", { name: "Chat with Lotus Spa" });
  await expect(page.locator(".chat-float .chat")).toBeHidden();
  await launcher.click();
  await expect(page.locator(".chat-float .chat")).toBeVisible();
  await page.locator(".chat-float").getByLabel("Your message").fill("is there parking?");
  await page.locator(".chat-float").getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".chat-float .msg.bot:not(.typing)").last()).toContainText("Free parking");
  await page.getByRole("button", { name: "Close chat" }).click();
  await expect(page.locator(".chat-float .chat")).toBeHidden();
});

test("the page never scrolls sideways on a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByLabel("Your message")).toBeVisible();
});
