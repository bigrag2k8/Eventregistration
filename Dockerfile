# syntax=docker/dockerfile:1.6

# ─── Stage 1: deps ────────────────────────────────────────
FROM node:20-slim AS deps
RUN --mount=type=cache,id=apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=apt-lib,target=/var/lib/apt,sharing=locked \
    apt-get update -y && apt-get install -y openssl ca-certificates
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN --mount=type=cache,id=npm-cache,target=/root/.npm \
    npm install --no-audit --no-fund

# ─── Stage 2: build ───────────────────────────────────────
FROM node:20-slim AS build
RUN --mount=type=cache,id=apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=apt-lib,target=/var/lib/apt,sharing=locked \
    apt-get update -y && apt-get install -y openssl ca-certificates
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    npx prisma generate && npm run build

# ─── Stage 3: runner ──────────────────────────────────────
FROM node:20-slim AS runner
RUN --mount=type=cache,id=apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=apt-lib,target=/var/lib/apt,sharing=locked \
    apt-get update -y && apt-get install -y openssl ca-certificates
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma

EXPOSE 3000
CMD ["npm", "start"]
