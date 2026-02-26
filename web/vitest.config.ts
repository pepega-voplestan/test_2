import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./tests/setup.ts"],
      testTimeout: 10_000,
      hookTimeout: 15_000,
      coverage: {
        provider: "v8",
        reportsDirectory: "./coverage",
        reporter: ["text", "html", "json-summary"],
        include: ["components/**", "context/**", "hooks/**"],
      },
    },
  })
);
