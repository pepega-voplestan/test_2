import { Queue } from "bullmq";
import { redisConnection } from "./redis.js";

export const notificationCleanupQueue = new Queue("notification-cleanup", {
  connection: redisConnection,
  defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50 },
});

export const dbBackupQueue = new Queue("db-backup", {
  connection: redisConnection,
  defaultJobOptions: { removeOnComplete: 20, removeOnFail: 20 },
});
