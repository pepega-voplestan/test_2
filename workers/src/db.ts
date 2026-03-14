import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development"
    ? ["warn", "error"]
    : ["warn", "error"],
});

await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
await prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON");

console.log("[Workers] Prisma client initialized");
