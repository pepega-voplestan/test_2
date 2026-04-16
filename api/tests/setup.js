/**
 * Vitest globalSetup — runs once before all test suites (in a separate process).
 * Resets the PostgreSQL test database and runs Prisma migrations.
 *
 * Requires TEST_DATABASE_URL to be set (e.g. in .env or environment):
 *   TEST_DATABASE_URL=postgresql://vopley_test:test-secret@localhost:6432/vopley_test
 */
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, "..");
const mediaTmpPath = path.join(apiDir, "tests", ".media-tmp");

export async function setup() {
  const dbUrl = process.env.TEST_DATABASE_URL;
  if (!dbUrl) {
    throw new Error("TEST_DATABASE_URL is not set. Set it to a PostgreSQL test database URL.");
  }

  // Ensure temp media dir exists
  fs.mkdirSync(mediaTmpPath, { recursive: true });

  // Drop and recreate schema, then apply all migrations
  execSync("npx prisma migrate reset --force --skip-seed", {
    cwd: apiDir,
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      NODE_ENV: "test",
    },
    stdio: "pipe",
  });

  // Write env vars to a temp file so the test worker process can pick them up
  const envContent = [
    `DATABASE_URL=${dbUrl}`,
    `NODE_ENV=test`,
    `SESSION_SECRET=test-secret`,
    `MEDIA_PATH=${mediaTmpPath}`,
  ].join("\n");
  fs.writeFileSync(path.join(apiDir, "tests", ".env.test"), envContent);

  console.log("[Test Setup] Database ready");
}

export async function teardown() {
  // Clean up env file
  const envFile = path.join(apiDir, "tests", ".env.test");
  if (fs.existsSync(envFile)) fs.unlinkSync(envFile);

  // Clean up temp media dir
  if (fs.existsSync(mediaTmpPath)) fs.rmSync(mediaTmpPath, { recursive: true });

  // Clean up avatar dir written by upload tests
  const avatarTmpPath = path.join(apiDir, "tests", "avatars");
  if (fs.existsSync(avatarTmpPath)) fs.rmSync(avatarTmpPath, { recursive: true });

  console.log("[Test Teardown] Database cleaned up");
}
