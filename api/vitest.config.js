import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    globalSetup: "./tests/setup.js",
    setupFiles: ["./tests/env.js"],
    // Integration tests share a single SQLite file — run files sequentially to avoid races
    fileParallelism: false,
    testTimeout: 10_000,
    hookTimeout: 15_000,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.js"],
      exclude: ["src/server.js", "src/swagger.js"],
    },
  },
});
