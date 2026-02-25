FROM node:20-alpine AS base
RUN apk add --no-cache python3 make g++ vips-dev openssl sqlite
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1

# --- App (used by both prod and dev) ---
FROM base AS app
RUN npm install --omit=dev
RUN npx prisma generate
COPY src ./src
COPY scripts ./scripts/
RUN chmod +x ./scripts/start.sh
CMD ["./scripts/start.sh"]

# --- Test ---
FROM base AS test
RUN npm install
RUN npx prisma generate
COPY src ./src
COPY tests ./tests/
COPY vitest.config.js ./
ENV NODE_ENV=test
ENV DATABASE_URL=file:/tmp/test.db
ENV SESSION_SECRET=test-secret
CMD ["npx", "vitest", "run", "--coverage"]
