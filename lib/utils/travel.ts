import { createHash } from "crypto"
import { adminDb } from "@/lib/firebase/admin"
import { isMapsAvailable, setMapsAvailable } from "./maps-status"

const CACHE_TTL_DAYS = 7

function hashCacheKey(origin: string, destination: string, day: string): string {
  return createHash("sha256").update(`${origin}|${destination}|${day}`).digest("hex").slice(0, 16)
}

interface TravelResult {
  durationMinutes: number
  distanceKm: number
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const response = await fetch(`${appUrl}/api/maps/distance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origins: originStr, destinations: destStr }),
    })

    if (!response.ok) {
      if (response.status === 503) setMapsAvailable(false)
      return null
    }

    const result: TravelResult = await response.json()

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
