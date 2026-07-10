import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Upstash is optional in local dev — when the env vars are absent we return a
// permissive limiter so the app runs without Redis.
const hasRedis =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasRedis ? Redis.fromEnv() : null;

function makeLimiter(limiter: ReturnType<typeof Ratelimit.slidingWindow>, prefix: string) {
  if (!redis) return null;
  return new Ratelimit({ redis, limiter, prefix, analytics: false });
}

// 60 block writes / hour / user.
const blockWriteLimiter = makeLimiter(
  Ratelimit.slidingWindow(60, "1 h"),
  "rl:block-write"
);

// 10 push-subscribe calls / day / user.
const pushSubscribeLimiter = makeLimiter(
  Ratelimit.slidingWindow(10, "1 d"),
  "rl:push-subscribe"
);

export type RateLimitResult = { success: boolean };

async function check(
  limiter: Ratelimit | null,
  key: string
): Promise<RateLimitResult> {
  if (!limiter) return { success: true };
  const { success } = await limiter.limit(key);
  return { success };
}

export function limitBlockWrite(userId: string) {
  return check(blockWriteLimiter, userId);
}

export function limitPushSubscribe(userId: string) {
  return check(pushSubscribeLimiter, userId);
}
