import { defineConfig, devices } from "@playwright/test"

const BASE_URL = process.env.BASE_URL || "http://localhost:3000"

export default defineConfig({
  testDir: "../tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // sequential — tests share backend state
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },

  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "playwright-report/results.json" }],
    ["list"],
  ],

  use: {
    baseURL: BASE_URL,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
