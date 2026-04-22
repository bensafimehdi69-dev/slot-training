import { createHash } from "crypto"
import { adminDb } from "@/lib/firebase/admin"
import { isMapsAvailable, setMapsAvailable } from "./maps-status"

const CACHE_TTL_DAYS = 7
const MAPS_FETCH_TIMEOUT_MS = 5_000

function hashCacheKey(origin: string, destination: string, day: string): string {
  return createHash("sha256").update(`${origin}|${destination}|${day}`).digest("hex").slice(0, 16)
}

interface TravelResult {
  durationMinutes: number
  distanceKm: number
}

/**
 * Calls Google Distance Matrix directly from the server. We used to round-trip
 * through `/api/maps/distance`, which doubled serverless invocations and
 * required exposing the route without auth (or forwarding cookies from the
 * action context). Direct call avoids both issues.
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
}

export async function getTravelTime(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  day: string,
  managerUid: string,
  groupId: string,
  campaignId: string
): Promise<TravelResult | null> {
  if (!isMapsAvailable()) return null

  const originStr = `${origin.lat},${origin.lng}`
  const destStr = `${destination.lat},${destination.lng}`
  const cacheKey = hashCacheKey(originStr, destStr, day)

  const cacheRef = adminDb
    .collection("managers").doc(managerUid)
    .collection("groups").doc(groupId)
    .collection("campaigns").doc(campaignId)
    .collection("travelTimes").doc(cacheKey)

  const cached = await cacheRef.get()
  if (cached.exists) {
    const data = cached.data()!
    const calculatedAt = data.calculatedAt?.toDate()
    const ageInDays = (Date.now() - calculatedAt.getTime()) / (1000 * 60 * 60 * 24)
    if (ageInDays < CACHE_TTL_DAYS) {
      return { durationMinutes: data.durationMinutes, distanceKm: data.distanceKm }
    }
  }

  try {
    const result = await fetchTravelFromGoogle(originStr, destStr)
    if (!result) {
      setMapsAvailable(false)
      return null
    }

    if (result.durationMinutes > 120) {
      console.warn(`[TRAVEL ALERT] Unusually long travel time: ${result.durationMinutes} min`)
    }

    await cacheRef.set({
      durationMinutes: result.durationMinutes,
      distanceKm: result.distanceKm,
      calculatedAt: new Date(),
    })

    return result
  } catch {
    setMapsAvailable(false)
    return null
  }
}
