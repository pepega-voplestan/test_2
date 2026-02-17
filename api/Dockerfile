FROM node:20-alpine
RUN apk add --no-cache python3 make g++ vips-dev
WORKDIR /app
COPY package*.json ./
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
RUN npm install --omit=dev
COPY src ./src
CMD ["npm", "start"]
