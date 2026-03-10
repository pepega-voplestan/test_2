import "dotenv/config";
import app from "./app.js";
import { prisma } from "./db.js";

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

// Graceful shutdown — close Prisma connection
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    console.log(`[API] ${signal} received, shutting down...`);
    await prisma.$disconnect();
    process.exit(0);
  });
}
