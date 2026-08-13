import {
  notificationCleanupQueue,
  dbBackupQueue,
  originalDowngradeQueue,
  mediaReclaimQueue,
} from "./queues.js";

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

  // Media reclaim — runs daily at 03:00 UTC, after the db-backup at 02:00 so a
  // day's snapshot is always taken before that day's files are removed.
  await mediaReclaimQueue.upsertJobScheduler(
    "daily-media-reclaim",
    { pattern: "0 3 * * *" },
    { name: "run", data: {} }
  );

  console.log("[Scheduler] Registered scheduled jobs");
}
