import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:4180",
    timezoneId: "Asia/Bangkok",
    locale: "en-GB",
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } }
  ],
  // Start our server with no API key, so the chat runs in demo mode
  webServer: {
    command: "node server/server.js",
    url: "http://localhost:4180/api/health",
    env: { PORT: "4180", OPENAI_API_KEY: "" },
    reuseExistingServer: !process.env.CI
  }
});
