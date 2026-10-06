# syntax = docker/dockerfile:1

# Replaces the busybox placeholder. Serves the Astro (@astrojs/node,
# standalone) app on 0.0.0.0:$PORT (fly.toml sets PORT). /readme/ is served
# by the app itself (src/pages/readme/index.astro), not by this file.

FROM node:24-slim AS builder
WORKDIR /app

# better-sqlite3 ships prebuilt binaries for common targets, but this makes
# sure it can compile from source if none matches this image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV DB_PATH=/data/app.db

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
COPY README.md ./README.md

EXPOSE 8080
CMD ["node", "scripts/migrate-and-start.mjs"]
