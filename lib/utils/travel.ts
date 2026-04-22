import { createHash } from "crypto"
import { adminDb } from "@/lib/firebase/admin"

const CACHE_TTL_DAYS = 7
const MAPS_FETCH_TIMEOUT_MS = 5_000

/**
 * Full SHA-256 hex digest keyed on `origin|destination|weekBucket`. The
 * previous 16-hex-char (64-bit) truncation allowed cache collisions at
 * plausible scale. We bucket by ISO-week rather than day-of-week so that
 * traffic pattern changes are eventually refreshed, but cache entries are
 * still shared across a single week.
 */
function cacheKey(origin: string, destination: string, weekBucket: string): string {
  return createHash("sha256").update(`${origin}|${destination}|${weekBucket}`).digest("hex")
}

function currentWeekBucket(): string {
  const now = new Date()
  // ISO week number, roughly. Good enough as a cache-bucket key.
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  const days = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const week = Math.floor((days + start.getUTCDay() + 1) / 7)
  return `${now.getUTCFullYear()}-W${week.toString().padStart(2, "0")}`
}

interface TravelResult {
  durationMinutes: number
  distanceKm: number
}

/**
 * Calls Google Distance Matrix directly. No more `/api/maps/distance`
 * round-trip, no more module-global `mapsAvailable` circuit breaker
 * (which was process-scoped on serverless and stuck `false` forever on
 * a transient failure). Callers decide how to react to a null return.
 */
async function fetchTravelFromGoogle(
  origin: string,
  destination: string
): Promise<TravelResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return null

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json")
  url.searchParams.set("origins", origin)
  url.searchParams.set("destinations", destination)
  url.searchParams.set("mode", "transit")
  url.searchParams.set("language", "fr")
  url.searchParams.set("key", apiKey)

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(MAPS_FETCH_TIMEOUT_MS),
    })
    const data = await response.json()

    if (data.status !== "OK") return null
    const element = data.rows?.[0]?.elements?.[0]
    if (!element || element.status !== "OK") return null

    return {
      durationMinutes: Math.ceil(element.duration.value / 60),
      distanceKm: Math.round((element.distance.value / 1000) * 10) / 10,
    }
  } catch {
    return null
  }
}

export async function getTravelTime(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  _day: string,
  managerUid: string,
  groupId: string,
  campaignId: string
): Promise<TravelResult | null> {
  const originStr = `${origin.lat},${origin.lng}`
  const destStr = `${destination.lat},${destination.lng}`
  const key = cacheKey(originStr, destStr, currentWeekBucket())

  const cacheRef = adminDb
    .collection("managers").doc(managerUid)
    .collection("groups").doc(groupId)
    .collection("campaigns").doc(campaignId)
    .collection("travelTimes").doc(key)

  const cached = await cacheRef.get()
  if (cached.exists) {
    const data = cached.data()!
    const calculatedAt = data.calculatedAt?.toDate()
    if (calculatedAt) {
      const ageDays = (Date.now() - calculatedAt.getTime()) / (1000 * 60 * 60 * 24)
      if (ageDays < CACHE_TTL_DAYS) {
        return { durationMinutes: data.durationMinutes, distanceKm: data.distanceKm }
      }
    }
  }

  const result = await fetchTravelFromGoogle(originStr, destStr)
  if (!result) return null

  if (result.durationMinutes > 120) {
    console.warn(`[TRAVEL ALERT] Unusually long travel time: ${result.durationMinutes} min`)
  }

  await cacheRef.set({
    durationMinutes: result.durationMinutes,
    distanceKm: result.distanceKm,
    calculatedAt: new Date(),
  })

  return result
}
