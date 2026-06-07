import Redis from "ioredis";

let _redis: Redis | null = null;

export function redis() {
  if (!_redis) _redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  return _redis;
}

/**
 * Sliding-window rate limiter using Redis.
 * Returns { allowed, remaining, resetAt }.
 */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const r = redis();
  const now = Date.now();
  const windowKey = `rl:${key}:${Math.floor(now / (windowSec * 1000))}`;
  const count = await r.incr(windowKey);
  if (count === 1) await r.expire(windowKey, windowSec);
  const remaining = Math.max(0, limit - count);
  return {
    allowed: count <= limit,
    remaining,
    resetAt: Math.ceil(now / 1000) + windowSec,
  };
}
