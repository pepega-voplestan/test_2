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

export const originalDowngradeQueue = new Queue("original-downgrade", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: "exponential", delay: 30000 },
  },
});

export const mediaReclaimQueue = new Queue("media-reclaim", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: "exponential", delay: 30000 },
  },
});
