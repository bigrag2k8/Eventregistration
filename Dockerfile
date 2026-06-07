# ─── Stage 1: deps ────────────────────────────────────────
FROM node:20-slim AS deps
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

# ─── Stage 2: build ───────────────────────────────────────
FROM node:20-slim AS build
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure public/ exists even if user has none
RUN mkdir -p public
RUN npx prisma generate && npm run build

# ─── Stage 3: runner ──────────────────────────────────────
FROM node:20-slim AS runner
RUN apt-get update -y && apt-get install -y openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN groupadd -r nodejs && useradd -r -g nodejs nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma

USER nextjs
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
