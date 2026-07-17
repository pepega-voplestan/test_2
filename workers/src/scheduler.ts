import { notificationCleanupQueue, dbBackupQueue, originalDowngradeQueue } from "./queues.js";

export async function registerScheduledJobs(): Promise<void> {
  // Notification cleanup — runs daily at 00:00 UTC
  await notificationCleanupQueue.upsertJobScheduler(
    "daily-notification-cleanup",
    { pattern: "0 0 * * *" },
    { name: "run", data: {} }
  );

  // Database backup — runs daily at 02:00 UTC
  await dbBackupQueue.upsertJobScheduler(
    "daily-db-backup",
    { pattern: "0 2 * * *" },
    { name: "run", data: {} }
  );

  // Original-quality downgrade sweep — every 5 minutes (well within the 15-min
  // SLA of the 24-hour deadline; see SC-002).
  await originalDowngradeQueue.upsertJobScheduler(
    "original-downgrade-sweep",
    { pattern: "*/5 * * * *" },
    { name: "run", data: {} }
  );

  console.log("[Scheduler] Registered scheduled jobs");
}
