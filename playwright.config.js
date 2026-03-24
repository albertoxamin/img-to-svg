// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8765",
    trace: "on-first-retry",
  },
  webServer: {
    command: "python3 -m http.server 8765",
    url: "http://127.0.0.1:8765",
    reuseExistingServer: !process.env.CI,
  },
});
