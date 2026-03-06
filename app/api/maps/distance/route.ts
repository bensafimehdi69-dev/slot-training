import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const { origins, destinations, departureTime } = await request.json()

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Maps API key not configured" }, { status: 500 })
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json")
    url.searchParams.set("origins", origins)
    url.searchParams.set("destinations", destinations)
    url.searchParams.set("mode", "transit")
    url.searchParams.set("language", "fr")
    url.searchParams.set("key", apiKey)
    if (departureTime) {
      url.searchParams.set("departure_time", departureTime)
    }

    const response = await fetch(url.toString())
    const data = await response.json()

    if (data.status !== "OK") {
      return NextResponse.json({ error: data.error_message || "Maps API error" }, { status: 500 })
    }

    const element = data.rows?.[0]?.elements?.[0]
    if (!element || element.status !== "OK") {
      return NextResponse.json({ error: "No route found" }, { status: 404 })
    }

    return NextResponse.json({
      durationMinutes: Math.ceil(element.duration.value / 60),
      distanceKm: Math.round((element.distance.value / 1000) * 10) / 10,
    })
  } catch {
    return NextResponse.json({ error: "Maps API unavailable" }, { status: 503 })
  }
}
