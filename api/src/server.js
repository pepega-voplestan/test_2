import "dotenv/config";
import app from "./app.js";
import { prisma } from "./db.js";
import { toSqliteDatetime } from "./helpers/common.js";

app.listen(3000, () => console.log(`[API] Server listening on :3000 (env=${process.env.NODE_ENV})`));

// ── Seed default settings ──
async function seedSettings() {
  await prisma.setting.upsert({
    where: { key: "registration_open" },
    update: {},
    create: { key: "registration_open", value: "true" },
  });
  console.log("[Settings] Default settings seeded");
}
seedSettings().catch((err) => console.error("[Settings] Seed error:", err));

// Periodic cleanup: hard-delete notifications older than 14 days
const NOTIFICATION_TTL_DAYS = 14;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

async function cleanupOldNotifications() {
  const cutoff = toSqliteDatetime(new Date(Date.now() - NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000));
  const { count } = await prisma.notification.deleteMany({
    where: { created_at: { lt: cutoff } },
  });
  if (count > 0) console.log(`[Cleanup] Deleted ${count} notifications older than ${NOTIFICATION_TTL_DAYS} days`);
}

cleanupOldNotifications().catch((err) => console.error("[Cleanup] Error:", err));
setInterval(
  () => cleanupOldNotifications().catch((err) => console.error("[Cleanup] Error:", err)),
  CLEANUP_INTERVAL_MS
);

// Graceful shutdown — close Prisma connection
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    console.log(`[API] ${signal} received, shutting down...`);
    await prisma.$disconnect();
    process.exit(0);
  });
}
