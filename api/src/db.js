import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development"
    ? ["query", "info", "warn", "error"]
    : ["warn", "error"],
});

// SQLite pragmas — Prisma doesn't set these automatically
await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
await prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON");

console.log("[DB] Prisma Client initialized");
