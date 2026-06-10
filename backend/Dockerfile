# Build stage
# node >= 23.4 required: the persistence layer uses the built-in node:sqlite
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Build, then strip devDependencies so the production stage can reuse
# node_modules without hitting the registry a second time
RUN npm run build && npm prune --omit=dev

# Production stage
FROM node:24-alpine

# Use Aliyun mirrors to avoid I/O or network errors during apk package extraction
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# System FFmpeg (the bundled @ffmpeg-installer binary is glibc-only and cannot
# run on Alpine/musl) + Noto CJK font for Chinese drawtext titles
RUN apk add --no-cache ffmpeg font-noto-cjk

WORKDIR /app

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets
# Copy template configs (TypeScript doesn't copy .json files)
COPY src/templates/configs ./dist/templates/configs

EXPOSE 8000

CMD ["node", "dist/index.js"]
