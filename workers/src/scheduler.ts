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

  // Original-quality downgrade sweep — runs hourly. An image may therefore stay
  // at original quality up to ~1h past its 24-hour deadline before the sweep
  // reclaims it.
  await originalDowngradeQueue.upsertJobScheduler(
    "original-downgrade-sweep",
    { pattern: "0 * * * *" },
    { name: "run", data: {} }
  );

  console.log("[Scheduler] Registered scheduled jobs");
}
