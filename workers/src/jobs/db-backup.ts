import { Worker } from "bullmq";
import { mkdir } from "fs/promises";
import path from "path";
import { prisma } from "../db.js";
import { redisConnection } from "../redis.js";

const BACKUP_DIR = process.env.BACKUP_DIR ?? "/data/backups";
const KEEP_BACKUPS = Number(process.env.KEEP_BACKUPS ?? 7);

export function createDbBackupWorker(): Worker {
  return new Worker(
    "db-backup",
    async () => {
      await mkdir(BACKUP_DIR, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = path.join(BACKUP_DIR, `app-${timestamp}.db`);

      // VACUUM INTO creates an atomic online backup without stopping writes
      await prisma.$executeRawUnsafe(`VACUUM INTO '${backupPath}'`);
      console.log(`[db-backup] Backup created: ${backupPath}`);

      // Prune old backups, keep the N most recent
      const { readdir, unlink } = await import("fs/promises");
      const files = (await readdir(BACKUP_DIR))
        .filter((f) => f.startsWith("app-") && f.endsWith(".db"))
        .sort();

      const toDelete = files.slice(0, Math.max(0, files.length - KEEP_BACKUPS));
      for (const file of toDelete) {
        await unlink(path.join(BACKUP_DIR, file));
        console.log(`[db-backup] Pruned old backup: ${file}`);
      }
    },
    { connection: redisConnection }
  );
}
