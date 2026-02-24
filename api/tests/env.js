/**
 * Vitest setupFiles — runs in the test worker process before each test file.
 * Loads env vars written by globalSetup.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, ".env.test");

if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, "utf-8").split("\n");
  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx > 0) {
      const key = line.slice(0, idx);
      const val = line.slice(idx + 1);
      process.env[key] = val;
    }
  }
}
