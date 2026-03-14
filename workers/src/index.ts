import "dotenv/config";
import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { notificationCleanupQueue, dbBackupQueue } from "./queues.js";
import { registerScheduledJobs } from "./scheduler.js";
import { createNotificationCleanupWorker } from "./jobs/notification-cleanup.js";
import { createDbBackupWorker } from "./jobs/db-backup.js";
import { prisma } from "./db.js";

const PORT = Number(process.env.WORKERS_PORT ?? 3001);
const BASE_PATH = process.env.BULL_BOARD_BASE_PATH ?? "/workers";

async function main() {
  // Start job workers
  const workers = [
    createNotificationCleanupWorker(),
    createDbBackupWorker(),
  ];

  // Register repeatable schedules (upsert — safe to run on every startup)
  await registerScheduledJobs();

  // Bull Board dashboard
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BASE_PATH);

  createBullBoard({
    queues: [
      new BullMQAdapter(notificationCleanupQueue),
      new BullMQAdapter(dbBackupQueue),
    ],
    serverAdapter,
  });

  const app = express();
  app.use(BASE_PATH, serverAdapter.getRouter());

  app.listen(PORT, () => {
    console.log(`[Workers] Bull Board dashboard at http://localhost:${PORT}${BASE_PATH}`);
    console.log(`[Workers] ${workers.length} worker(s) processing jobs`);
  });

  // Graceful shutdown
  async function shutdown() {
    console.log("[Workers] Shutting down...");
    await Promise.all(workers.map((w) => w.close()));
    await prisma.$disconnect();
    process.exit(0);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[Workers] Fatal startup error:", err);
  process.exit(1);
});
