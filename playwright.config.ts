import { defineConfig, devices } from "@playwright/test";

// NANoDB Core P0 browser scenarios. These run against a already-running app
// (built frontend served same-origin by the FastAPI backend with a reachable
// PostgreSQL). Start the stack first, e.g. `make demo`, then run
// `npm run test:e2e`. The base URL is overridable with E2E_BASE_URL.
//
// Test execution and the final pass/fail judgment happen in the Build and Test
// stage; this file and the specs under tests/e2e/ define the scenarios only.

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    acceptDownloads: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
