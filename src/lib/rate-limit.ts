import Redis from "ioredis";

let _redis: Redis | null = null;

export function redis() {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      // Fail fast instead of hanging requests when Redis is unreachable.
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    // Without a listener, ioredis connection errors become unhandled 'error'
    // events that crash the process.
    _redis.on("error", (e) => {
      console.error("[redis] connection error:", e?.message);
    });
  }
  return _redis;
}

/**
 * Fixed-window rate limiter using Redis.
 * Returns { allowed, remaining, resetAt }.
 *
 * FAILS OPEN: if Redis is down, requests are allowed. Rate limiting protects
 * against abuse; it must never take sign-in, sign-up, or door check-in down
 * with it during a Redis outage.
 */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const now = Date.now();
  try {
    const r = redis();
    const windowKey = `rl:${key}:${Math.floor(now / (windowSec * 1000))}`;
    const count = await r.incr(windowKey);
    if (count === 1) await r.expire(windowKey, windowSec);
    const remaining = Math.max(0, limit - count);
    return {
      allowed: count <= limit,
      remaining,
      resetAt: Math.ceil(now / 1000) + windowSec,
    };
  } catch (e: any) {
    console.error("[rate-limit] Redis unavailable, failing open:", e?.message);
    return { allowed: true, remaining: limit, resetAt: Math.ceil(now / 1000) + windowSec };
  }
}
