import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.pw.ts",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    actionTimeout: 15_000,
    baseURL: "http://127.0.0.1:4620",
    viewport: { width: 1440, height: 900 },
    channel: "chrome",
    launchOptions: { args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] },
  },
});
