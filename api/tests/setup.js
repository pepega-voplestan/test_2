/**
 * Vitest globalSetup — runs once before all test suites (in a separate process).
 * Creates a fresh SQLite test database and runs Prisma migrations.
 */
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, "..");
const testDbPath = path.join(apiDir, "tests", "test.db");
const mediaTmpPath = path.join(apiDir, "tests", ".media-tmp");

export async function setup() {
  // Remove stale test DB if it exists
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const f = testDbPath + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  // Ensure temp media dir exists
  fs.mkdirSync(mediaTmpPath, { recursive: true });

  const dbUrl = `file:${testDbPath}`;

  // Run Prisma migrations to create schema
  execSync("npx prisma migrate deploy", {
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

  console.log(`[Test Setup] Database ready at ${testDbPath}`);
}

export async function teardown() {
  // Clean up test DB files
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const f = testDbPath + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  // Clean up env file
  const envFile = path.join(apiDir, "tests", ".env.test");
  if (fs.existsSync(envFile)) fs.unlinkSync(envFile);

  // Clean up temp media dir
  const mediaTmpPath = path.join(apiDir, "tests", ".media-tmp");
  if (fs.existsSync(mediaTmpPath)) fs.rmSync(mediaTmpPath, { recursive: true });

  console.log("[Test Teardown] Database cleaned up");
}
