import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development"
    ? ["warn", "error"]
    : ["warn", "error"],
});

console.log("[Workers] Prisma client initialized");
