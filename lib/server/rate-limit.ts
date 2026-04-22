// Server-only Firestore-backed rate limiter.
//
// Schema: `rateLimits/{key}` → { count, windowStart, updatedAt }
//
// Why Firestore and not Redis / Upstash:
//   - No new service to provision, no account required.
//   - Adequate for the auth / magic-link / Maps paths we gate here —
//     those aren't latency-critical (extra ~50-100ms is acceptable).
//   - Transaction-based so concurrent calls converge on the real count.
//
// Trade-offs vs. a proper token-bucket in Redis:
//   - Each check = 1 Firestore read + 1 write (cost).
//   - Fixed-window counter (not sliding): a burst right before and right
//     after the window boundary can exceed `max` briefly. Fine for our
//     threat model (spam / DoS).
//   - If Firestore is unavailable, `checkRateLimit` throws — callers
//     should surface a generic error rather than block legitimate users.

import "server-only"

import { headers } from "next/headers"
import { adminDb } from "@/lib/firebase/admin"

const COLLECTION = "rateLimits"

export interface RateLimitConfig {
  /** Stable identifier for the bucket. Include the IP / email / user id. */
  key: string
  /** Maximum number of hits allowed per window. */
  max: number
  /** Window size in milliseconds. */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const ref = adminDb.collection(COLLECTION).doc(sanitizeKey(config.key))
  return adminDb.runTransaction<RateLimitResult>(async (tx) => {
    const snap = await tx.get(ref)
    const now = Date.now()
    const data = snap.data()
    const windowStartMs = (data?.windowStart as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0
    const count = (data?.count as number | undefined) ?? 0

    // Open a fresh window if none exists or the current one has rolled over.
    if (!data || now - windowStartMs > config.windowMs) {
      tx.set(ref, {
        count: 1,
        windowStart: new Date(now),
        updatedAt: new Date(now),
      })
      return { allowed: true, remaining: config.max - 1, retryAfterMs: 0 }
    }

    if (count >= config.max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, config.windowMs - (now - windowStartMs)),
      }
    }

    tx.update(ref, { count: count + 1, updatedAt: new Date(now) })
    return { allowed: true, remaining: config.max - count - 1, retryAfterMs: 0 }
  })
}

/**
 * Extracts the client IP from standard proxy headers. Falls back to "unknown"
 * if none are set, which is acceptable for rate-limiting purposes (the
 * "unknown" bucket just becomes a shared limit for that edge case).
 */
export async function getClientIp(): Promise<string> {
  const h = await headers()
  const forwardedFor = h.get("x-forwarded-for")
  if (forwardedFor) {
    // Use only the first IP (the client); subsequent entries are proxies.
    const first = forwardedFor.split(",")[0]?.trim()
    if (first) return first
  }
  const realIp = h.get("x-real-ip")
  if (realIp) return realIp.trim()
  return "unknown"
}

export function formatRetryAfter(ms: number): string {
  const minutes = Math.ceil(ms / 60_000)
  if (minutes <= 1) return "une minute"
  if (minutes < 60) return `${minutes} minutes`
  return `${Math.ceil(minutes / 60)} h`
}

// Firestore doc IDs can't contain '/' and have a 1500-byte limit. Normalise
// user-supplied key fragments (IPs are fine; emails may contain ':' on rare
// providers). We keep it ASCII-safe by URL-encoding.
function sanitizeKey(raw: string): string {
  const encoded = encodeURIComponent(raw).slice(0, 512)
  return encoded.length > 0 ? encoded : "empty"
}
