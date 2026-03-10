import { Worker } from "bullmq";
import { prisma } from "../db.js";
import { redisConnection } from "../redis.js";

const TTL_DAYS = 14;

function toSqliteDatetime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export function createNotificationCleanupWorker(): Worker {
  return new Worker(
    "notification-cleanup",
    async () => {
      const cutoff = toSqliteDatetime(
        new Date(Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000)
      );
      const { count } = await prisma.notification.deleteMany({
        where: { created_at: { lt: cutoff } },
      });
      if (count > 0) {
        console.log(`[notification-cleanup] Deleted ${count} notifications older than ${TTL_DAYS} days`);
      } else {
        console.log("[notification-cleanup] No expired notifications to delete");
      }
    },
    { connection: redisConnection }
  );
}
