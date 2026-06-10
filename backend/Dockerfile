# syntax=docker/dockerfile:1.7
#
# Build stage
# node >= 23.4 required: the persistence layer uses the built-in node:sqlite
FROM node:24-bookworm-slim AS builder

WORKDIR /app
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_factor=2 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=120000 \
    npm_config_audit=false \
    npm_config_fund=false

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    for attempt in 1 2 3 4 5; do \
      npm ci --cache=/root/.npm --prefer-offline --progress=false && exit 0; \
      echo "npm ci failed on attempt ${attempt}, retrying..."; \
      sleep $((attempt * 5)); \
    done; \
    exit 1

COPY . .
# Build, then strip devDependencies so the production stage can reuse
# node_modules without hitting the registry a second time
RUN npm run build && npm prune --omit=dev

# Production stage
FROM node:24-bookworm-slim

# Remotion renders through Chrome Headless Shell. Debian is recommended by
# Remotion; Alpine/musl is fragile for browser-based rendering.
RUN apt-get -o Acquire::Retries=5 update && apt-get install -o Acquire::Retries=5 -y --no-install-recommends \
    ca-certificates \
    chromium \
    ffmpeg \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets
# Copy template configs (TypeScript doesn't copy .json files)
COPY src/templates/configs ./dist/templates/configs

EXPOSE 8000

CMD ["node", "dist/index.js"]
