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

export interface TravelResult {
  // Walking and driving durations in minutes. Both are fetched in parallel so
  // the planning UI can display both modes; the optimiser uses the longer of
  // the two as the worst-case travel budget when deciding feasibility.
  walkingMinutes: number
  drivingMinutes: number
  // Driving distance — kept for telemetry / "unusually long" alert logging.
  distanceKm: number
}

/**
 * Calls Google Distance Matrix for a single mode. Caller fans out walking
 * and driving in parallel.
 */
async function fetchTravelFromGoogle(
  origin: string,
  destination: string,
  mode: "walking" | "driving"
): Promise<{ durationMinutes: number; distanceKm: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return null

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json")
  url.searchParams.set("origins", origin)
  url.searchParams.set("destinations", destination)
  url.searchParams.set("mode", mode)
  // Driving with `departure_time=now` lets Google factor in real-time traffic
  // (otherwise it returns a free-flow estimate). Walking ignores this.
  if (mode === "driving") {
    url.searchParams.set("departure_time", "now")
  }
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

    // Prefer `duration_in_traffic` when present (driving + departure_time),
    // otherwise fall back to the static duration.
    const durationSeconds: number =
      element.duration_in_traffic?.value ?? element.duration.value

    return {
      durationMinutes: Math.ceil(durationSeconds / 60),
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
    // Only trust cache entries written under the new (walking + driving)
    // schema. Pre-fix entries had a single `durationMinutes` field — those
    // are silently ignored so the optimiser refetches with the new modes.
    if (
      calculatedAt &&
      typeof data.walkingMinutes === "number" &&
      typeof data.drivingMinutes === "number"
    ) {
      const ageDays = (Date.now() - calculatedAt.getTime()) / (1000 * 60 * 60 * 24)
      if (ageDays < CACHE_TTL_DAYS) {
        return {
          walkingMinutes: data.walkingMinutes,
          drivingMinutes: data.drivingMinutes,
          distanceKm: data.distanceKm ?? 0,
        }
      }
    }
  }

  const [walking, driving] = await Promise.all([
    fetchTravelFromGoogle(originStr, destStr, "walking"),
    fetchTravelFromGoogle(originStr, destStr, "driving"),
  ])

  // We need both modes to be informative. If either one fails, treat the call
  // as failed so the optimiser falls back to its permissive branch instead of
  // calibrating against a half-known trip.
  if (!walking || !driving) return null

  const result: TravelResult = {
    walkingMinutes: walking.durationMinutes,
    drivingMinutes: driving.durationMinutes,
    // Driving distance is the canonical "how far" — walking distance can be
    // dramatically larger because it routes via footpaths.
    distanceKm: driving.distanceKm,
  }

  if (Math.max(walking.durationMinutes, driving.durationMinutes) > 120) {
    console.warn(
      `[TRAVEL ALERT] Unusually long travel time: walking=${walking.durationMinutes}min driving=${driving.durationMinutes}min`
    )
  }

  await cacheRef.set({
    walkingMinutes: result.walkingMinutes,
    drivingMinutes: result.drivingMinutes,
    distanceKm: result.distanceKm,
    calculatedAt: new Date(),
  })

  return result
}
