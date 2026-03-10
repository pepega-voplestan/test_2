import { notificationCleanupQueue, dbBackupQueue } from "./queues.js";

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

  console.log("[Scheduler] Registered scheduled jobs");
}
