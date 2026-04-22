import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/firebase/auth"
import { checkRateLimit, formatRetryAfter } from "@/lib/server/rate-limit"

// Accept either a bare "lat,lng" string (Google Distance Matrix format) or an
// array of up to 25 such strings. We deliberately bound both length and count
// to cap the cost of a single call against Google's billed API.
const coordPair = z
  .string()
  .regex(/^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/, "Coordonnées invalides.")
  .max(50)

const pointsField = z
  .union([coordPair, z.array(coordPair).min(1).max(25)])
  .transform((v) => (Array.isArray(v) ? v.join("|") : v))

const bodySchema = z.object({
  origins: pointsField,
  destinations: pointsField,
  // Google expects a Unix timestamp in seconds. Allow "now" or a future time
  // up to one year ahead — reject past timestamps and absurd values.
  departureTime: z
    .union([z.literal("now"), z.coerce.number().int().positive().max(2_000_000_000)])
    .optional(),
})

const FETCH_TIMEOUT_MS = 5_000

export async function POST(request: NextRequest) {
  // Gate behind a valid session — this endpoint proxies a billed Google API.
  // Without authentication an anonymous caller could drain the Maps quota.
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 })
  }

  // Per-user rate limit — a compromised session shouldn't be able to burn
  // the Maps quota either. 60 req / 10 min is generous for legitimate
  // client-side autocomplete usage and well under Google's quota ceiling.
  const rl = await checkRateLimit({
    key: `maps-distance:uid:${session.uid}`,
    max: 60,
    windowMs: 10 * 60 * 1000,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Trop de requêtes. Réessayez dans ${formatRetryAfter(rl.retryAfterMs)}.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Paramètres invalides." },
      { status: 400 }
    )
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Maps API key not configured" }, { status: 500 })
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json")
    url.searchParams.set("origins", parsed.data.origins)
    url.searchParams.set("destinations", parsed.data.destinations)
    url.searchParams.set("mode", "transit")
    url.searchParams.set("language", "fr")
    url.searchParams.set("key", apiKey)
    if (parsed.data.departureTime !== undefined) {
      url.searchParams.set("departure_time", String(parsed.data.departureTime))
    }

    // Bound the outbound call so a hanging Google response doesn't tie up the
    // serverless slot up to the platform hard-limit.
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    const data = await response.json()

    if (data.status !== "OK") {
      return NextResponse.json({ error: data.error_message || "Maps API error" }, { status: 502 })
    }

    const element = data.rows?.[0]?.elements?.[0]
    if (!element || element.status !== "OK") {
      return NextResponse.json({ error: "No route found" }, { status: 404 })
    }

    return NextResponse.json({
      durationMinutes: Math.ceil(element.duration.value / 60),
      distanceKm: Math.round((element.distance.value / 1000) * 10) / 10,
    })
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "TimeoutError"
    return NextResponse.json(
      { error: isAbort ? "Maps API timeout" : "Maps API unavailable" },
      { status: 503 }
    )
  }
}
