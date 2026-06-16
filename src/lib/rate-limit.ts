import Redis from "ioredis";

/**
 * Trusted client IP for rate-limit keys (SEC-06).
 *
 * X-Forwarded-For is a comma-separated chain `client, proxy1, proxy2, ...` where
 * each hop APPENDS the address it received the request from. A client can only
 * spoof the LEFT entries; the RIGHTMOST entry is the one our trusted proxy
 * (Railway's edge) appended for the actual inbound connection, so it cannot be
 * forged by the caller. Using the leftmost value let an attacker rotate the
 * header to dodge per-IP limits; using the rightmost defeats that.
 *
 * Assumes exactly one trusted proxy in front (Railway, no additional CDN). If a
 * CDN is added later, count back one more hop.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.headers.get("x-real-ip")?.trim() || "anon";
}

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

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // unix seconds
}

/**
 * Per-process in-memory fixed-window fallback, used when Redis is unreachable.
 *
 * It is intentionally NOT global (each web/worker instance keeps its own
 * counters), so protection degrades but is never removed: a brute-forcer
 * hammering one instance is still throttled, while a legitimate low-volume user
 * passes. This avoids the two bad extremes during a Redis outage — fail-open
 * (no protection at all, the SEC-01 finding) and fail-closed (locking every
 * real user out, a self-inflicted DoS).
 */
const memBuckets = new Map<string, { count: number; resetAt: number }>();

function memoryRateLimit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  let bucket = memBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    memBuckets.set(key, bucket);
  }
  bucket.count += 1;

  // Bound memory: opportunistically evict expired windows when the map grows.
  if (memBuckets.size > 10_000) {
    for (const [k, v] of memBuckets) if (v.resetAt <= now) memBuckets.delete(k);
  }

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: Math.ceil(bucket.resetAt / 1000),
  };
}

/**
 * Fixed-window rate limiter (Redis-backed, global across instances).
 *
 * On a Redis outage it does NOT fail open. By default it degrades to a
 * per-process in-memory limiter (see memoryRateLimit) so auth endpoints
 * (sign-in, sign-up, magic-link, forgot/reset-password) keep their brute-force
 * protection even while Redis is down. Pass { failOpen: true } only for
 * genuinely non-security throttling where availability must win over protection.
 *
 * Backward compatible: callers using rateLimit(key, limit, window) automatically
 * get the in-memory fallback.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
  opts?: { failOpen?: boolean },
): Promise<RateLimitResult> {
  const now = Date.now();
  try {
    const r = redis();
    const windowKey = `rl:${key}:${Math.floor(now / (windowSec * 1000))}`;
    const count = await r.incr(windowKey);
    if (count === 1) await r.expire(windowKey, windowSec);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: Math.ceil(now / 1000) + windowSec,
    };
  } catch (e: any) {
    if (opts?.failOpen) {
      console.error("[rate-limit] Redis unavailable, failing open (explicit opt-in):", e?.message);
      return { allowed: true, remaining: limit, resetAt: Math.ceil(now / 1000) + windowSec };
    }
    // Default: keep protecting via the local fallback instead of allowing all.
    console.error("[rate-limit] Redis unavailable, using in-memory fallback:", e?.message);
    return memoryRateLimit(key, limit, windowSec);
  }
}
