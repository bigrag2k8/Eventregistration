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

# NEXT_PUBLIC_* env vars must be present at BUILD TIME — Next.js inlines them
# into the client JS bundle during `next build`. Railway only injects env vars
# into the build process when the Dockerfile declares ARG for each one and
# re-exports them as ENV before `npm run build` runs.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_KEY
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ARG NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_KEY
ENV NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=$NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ENV NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=$NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
# Sentry DSN must be inlined at build for the client bundle + the Sentry config
# files (otherwise it's `undefined` at build → Sentry initializes disabled).
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
RUN npx prisma generate && npm run build

# ─── Stage 3: runner ──────────────────────────────────────
FROM node:20-slim AS runner
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# next.config.mjs is read by `next start` AT RUNTIME — without it the server boots
# with default config and experimental.instrumentationHook is off, so
# src/instrumentation.ts (Sentry server init) never runs.
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/prisma ./prisma
# src + tsconfig included so the worker service (npx tsx src/server/worker.ts) can run from this image
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
# scripts/ included so one-off maintenance jobs (e.g. npx tsx scripts/backfill-platform-fees.ts)
# can run inside the deployed image via a Railway one-off command
COPY --from=build /app/scripts ./scripts

EXPOSE 3000
CMD ["npm", "start"]
