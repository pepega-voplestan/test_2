# Build context must be repo root: `docker build -f workers/Dockerfile .`

FROM node:20-alpine AS base

WORKDIR /app

COPY workers/package*.json ./
RUN npm ci

# Copy schema directly (symlink is resolved by Docker COPY from repo root)
COPY api/prisma/schema.prisma ./prisma/schema.prisma
RUN npx prisma generate

# ── Production build ──────────────────────────────────────────────────────────
FROM base AS builder

COPY workers/tsconfig.json ./
COPY workers/src ./src
RUN npm run build

FROM node:20-alpine AS app

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001

CMD ["node", "dist/index.js"]

# ── Development (tsx watch) ───────────────────────────────────────────────────
FROM base AS dev

COPY workers/tsconfig.json ./

EXPOSE 3001

CMD ["npx", "tsx", "watch", "src/index.ts"]
