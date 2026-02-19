FROM node:20-alpine
RUN apk add --no-cache python3 make g++ vips-dev openssl sqlite
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
RUN npm install --omit=dev
RUN npx prisma generate
COPY src ./src
COPY scripts ./scripts/
RUN chmod +x ./scripts/start.sh
CMD ["./scripts/start.sh"]
