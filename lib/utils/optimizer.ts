import type { DayKey } from "@/lib/types/schedule"
import { dayKeys, dayLabels } from "@/lib/types/schedule"
import type { WeeklySchedule } from "@/lib/types/schedule"
import type {
  SlotResult,
  AthleteSlotInfo,
  IndividualSlot,
  OptimizationResult,
  DailyPlanning,
  DailySession,
} from "@/lib/types/planning"
import type { AddressWithCoords } from "@/lib/types/address"
import { getDepartureInfo, getReturnInfo, getOverlapConflict } from "./departure"
import { getTravelTime, type TravelResult } from "./travel"

interface AthleteData {
  athleteId: string
  firstName: string
  lastName: string
  schedule: WeeklySchedule
  homeAddress: AddressWithCoords
  schoolAddress: AddressWithCoords | null
}

interface CampaignConfig {
  timeRangeStart: string
  timeRangeEnd: string
  trainingLocation: AddressWithCoords
  // Coach + facility availability — 7 days × 16 hours of booleans matching
  // the athlete schedule grid. true = a slot starting in this hour is allowed,
  // false = the coach or the room is unavailable so the optimiser must skip it.
  availableSlots: boolean[][]
  managerUid: string
  groupId: string
  campaignId: string
  // In-memory travel cache, populated by `optimizeSlots` and reused by every
  // checkAthleteForSlot call inside the same invocation. Each (origin → dest)
  // pair hits Firestore at most once instead of dozens of times. Optional
  // so unit / ad-hoc callers can pass a config without a cache.
  travelCache?: Map<string, TravelResult | null>
}

/**
 * Cache-aware wrapper around getTravelTime. With many slot/duration combos
 * we end up asking for the same (origin, destination) pair hundreds of times
 * — Firestore caches it but each call is still a network round-trip. The
 * in-memory map cuts that to one read per pair per `optimizeSlots` call.
 */
async function fetchTravel(
  origin: AddressWithCoords,
  destination: AddressWithCoords,
  day: DayKey,
  config: CampaignConfig
): Promise<TravelResult | null> {
  const key = `${origin.lat},${origin.lng}->${destination.lat},${destination.lng}`
  const cache = config.travelCache
  if (cache?.has(key)) return cache.get(key) ?? null
  const result = await getTravelTime(
    origin,
    destination,
    day,
    config.managerUid,
    config.groupId,
    config.campaignId
  )
  cache?.set(key, result)
  return result
}

// Map a HH:MM start time to the hour bucket the availableSlots grid uses.
// The grid covers 07:00..22:00 in 1-hour buckets (16 cells), matching the
// athlete-side ConstraintsTapGrid. A slot starting at 08:30 falls in the
// 08:00 bucket. Slots starting outside 07–22 are treated as unavailable.
const AVAILABILITY_GRID_FIRST_HOUR = 7
const AVAILABILITY_GRID_HOURS = 16
// Row order in ConstraintsTapGrid / AthleteAvailabilityGrid is the local
// week-start convention: Dim=0, Lun=1, …, Sam=6.
const dayKeyToGridIndex: Record<DayKey, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
}

function isSlotAllowed(grid: boolean[][], day: DayKey, slotStart: string): boolean {
  const dayIndex = dayKeyToGridIndex[day]
  const row = grid[dayIndex]
  if (!row) return true // grid malformed — be permissive rather than blocking everyone
  const hour = Number(slotStart.split(":")[0])
  const cellIndex = hour - AVAILABILITY_GRID_FIRST_HOUR
  if (cellIndex < 0 || cellIndex >= AVAILABILITY_GRID_HOURS) return false
  return row[cellIndex] !== false
}

// Business parameters — colocated so they're easy to tune.
// Collective sessions are 1h30 by default and extend to 2h when every
// participating athlete can stay the extra 30 min (no upcoming class /
// home obligation that would force them to leave early).
const COLLECTIVE_BASE_DURATION_MINUTES = 90
const COLLECTIVE_EXTENDED_DURATION_MINUTES = 120
// Individual sessions run 1h by default. When that doesn't fit the
// athlete's schedule we fall back to the 45-min floor so a tight gap
// between two classes can still host an individual.
const INDIVIDUAL_DURATION_MINUTES = 60
const INDIVIDUAL_FALLBACK_DURATION_MINUTES = 45
// Used during slot enumeration. The base 90-min duration drives the main
// pass; ad-hoc 60/45/120 checks are done in the post-processing step.
const SLOT_DURATION_MINUTES = COLLECTIVE_BASE_DURATION_MINUTES
const SLOT_STEP_MINUTES = 15
const MAPS_FAILURE_ABORT_RATIO = 0.5
// Margin we leave between the athlete's worst-case arrival at the venue and
// the official slot start so they have time to change before training. Same
// margin is also held back on the return leg (change after training, then
// travel to next obligation).
const CHANGING_BUFFER_MINUTES = 10

// Per-day session windows agreed with product:
// - Morning (07h–12h): preferred window for the optional second session.
// - End of day (16h–21h): preferred window for the daily collective session.
// A slot belongs to a window if its START hour falls inside the window;
// the slot may extend past the upper bound by less than the slot duration.
const MORNING_WINDOW_START_HOUR = 7
const MORNING_WINDOW_END_HOUR = 12
const END_OF_DAY_WINDOW_START_HOUR = 16
const END_OF_DAY_WINDOW_END_HOUR = 21

// A morning session counts as a real "collective" only with at least this many
// athletes. Below the threshold, the optimiser splits the morning into one or
// more individual back-to-back sessions instead.
const MORNING_COLLECTIVE_MIN_ATHLETES = 5

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

function generateTimeSlots(start: string, end: string, stepMinutes = SLOT_STEP_MINUTES): string[] {
  const slots: string[] = []
  const startMin = timeToMinutes(start)
  const endMin = timeToMinutes(end)
  for (let m = startMin; m < endMin; m += stepMinutes) {
    slots.push(minutesToTime(m))
  }
  return slots
}

/**
 * Enumerates every (origin, day) pair the optimizer could ask the travel
 * service about, in one pass. Previously the optimizer issued these fetches
 * sequentially from inside a triple loop (O(days × slots × athletes)), which
 * blew past serverless timeouts as soon as the group grew past ~10 athletes.
 *
 * We pre-warm the Firestore travel cache with a single parallel fan-out, then
 * the main loop only hits the cache.
 */
function enumerateUniqueTravelPairs(
  athletes: AthleteData[]
): Array<{ origin: AddressWithCoords; day: DayKey }> {
  const seen = new Set<string>()
  const pairs: Array<{ origin: AddressWithCoords; day: DayKey }> = []

  for (const day of dayKeys) {
    for (const athlete of athletes) {
      // Home is always a possible departure point on any day.
      const homeKey = `${day}|${athlete.homeAddress.lat},${athlete.homeAddress.lng}`
      if (!seen.has(homeKey)) {
        seen.add(homeKey)
        pairs.push({ origin: athlete.homeAddress, day })
      }

      // School becomes a possible departure point if the athlete has a class
      // on that day and we know their school address.
      const daySchedule = athlete.schedule[day] || []
      if (daySchedule.length > 0 && athlete.schoolAddress) {
        const schoolKey = `${day}|${athlete.schoolAddress.lat},${athlete.schoolAddress.lng}`
        if (!seen.has(schoolKey)) {
          seen.add(schoolKey)
          pairs.push({ origin: athlete.schoolAddress, day })
        }
      }
    }
  }
  return pairs
}

/**
 * Mirror enumeration for the return leg (training → next location). We need
 * to ask Distance Matrix in the opposite direction for the days where an
 * athlete has at least one occupied slot after a candidate training slot.
 * Pre-warming the cache here avoids the inner loop blocking on N round-trips.
 */
function enumerateUniqueReturnPairs(
  athletes: AthleteData[]
): Array<{ destination: AddressWithCoords; day: DayKey }> {
  const seen = new Set<string>()
  const pairs: Array<{ destination: AddressWithCoords; day: DayKey }> = []

  for (const day of dayKeys) {
    for (const athlete of athletes) {
      // The athlete might need to go home or to school after training.
      const homeKey = `${day}|return|${athlete.homeAddress.lat},${athlete.homeAddress.lng}`
      if (!seen.has(homeKey)) {
        seen.add(homeKey)
        pairs.push({ destination: athlete.homeAddress, day })
      }
      const daySchedule = athlete.schedule[day] || []
      const hasSchoolSlot = daySchedule.some((s) => s.location === "school")
      if (hasSchoolSlot && athlete.schoolAddress) {
        const schoolKey = `${day}|return|${athlete.schoolAddress.lat},${athlete.schoolAddress.lng}`
        if (!seen.has(schoolKey)) {
          seen.add(schoolKey)
          pairs.push({ destination: athlete.schoolAddress, day })
        }
      }
    }
  }
  return pairs
}

export class MapsUnavailableError extends Error {
  constructor() {
    super("Google Maps a échoué sur la majorité des trajets. Optimisation annulée.")
    this.name = "MapsUnavailableError"
  }
}

export async function optimizeSlots(
  athletes: AthleteData[],
  config: CampaignConfig
): Promise<OptimizationResult> {
  const timeSlots = generateTimeSlots(config.timeRangeStart, config.timeRangeEnd)
  const days = dayKeys

  // Decision trace — every meaningful step pushes one line. Surfaced both
  // in Cloud Run logs (via console.info) and in the UI's debug panel so we
  // can post-mortem the algo's choices.
  const debug: string[] = []
  const debugLog = (line: string) => {
    console.info(`[OPTIMIZER] ${config.campaignId} ${line}`)
    debug.push(line)
  }

  debugLog(
    `start: athletes=${athletes.length} ` +
      `range=${config.timeRangeStart}-${config.timeRangeEnd} ` +
      `slotStep=${SLOT_STEP_MINUTES}min`
  )

  // Allocate the in-memory travel cache and surface it through the config so
  // every checkAthleteForSlot call inside this invocation hits the same map.
  // We never wrote to a caller-provided cache before, so always create a
  // fresh one — keeps the function pure between invocations.
  const cfg: CampaignConfig = { ...config, travelCache: new Map() }

  // Pre-warm the travel-time cache in parallel. Every inner call then reads
  // from `cfg.travelCache` synchronously. We warm BOTH directions: the trip
  // to the training and the return trip to the athlete's next location.
  const departurePairs = enumerateUniqueTravelPairs(athletes)
  const returnPairs = enumerateUniqueReturnPairs(athletes)
  const allPairs: Array<{
    origin: AddressWithCoords
    destination: AddressWithCoords
    day: DayKey
  }> = [
    ...departurePairs.map((p) => ({
      origin: p.origin,
      destination: cfg.trainingLocation,
      day: p.day,
    })),
    ...returnPairs.map((p) => ({
      origin: cfg.trainingLocation,
      destination: p.destination,
      day: p.day,
    })),
  ]
  if (allPairs.length > 0) {
    const warmupStart = Date.now()
    const warmupResults = await Promise.all(
      allPairs.map(({ origin, destination, day }) =>
        fetchTravel(origin, destination, day, cfg)
      )
    )
    const failures = warmupResults.filter((r) => r === null).length
    debugLog(
      `warmup: ${allPairs.length} pairs, ${failures} failures, ` +
        `${((Date.now() - warmupStart) / 1000).toFixed(1)}s`
    )
    if (failures / warmupResults.length > MAPS_FAILURE_ABORT_RATIO) {
      throw new MapsUnavailableError()
    }
  } else {
    debugLog("warmup: skipped (no athletes)")
  }

  const results: SlotResult[] = []
  const mainStart = Date.now()

  for (const day of days) {
    for (const slotStart of timeSlots) {
      const slotEnd = minutesToTime(timeToMinutes(slotStart) + SLOT_DURATION_MINUTES)
      if (timeToMinutes(slotEnd) > timeToMinutes(config.timeRangeEnd)) continue

      // Hard filter: coach + facility must be available for this slot's hour.
      if (!isSlotAllowed(config.availableSlots, day, slotStart)) continue

      const checks = await Promise.all(
        athletes.map((a) => checkAthleteForSlot(a, day, slotStart, slotEnd, cfg))
      )
      const availableAthletes = checks.filter((c) => c.available)
      const unavailableAthletes = checks.filter((c) => !c.available)

      const avgOf = (pick: (a: AthleteSlotInfo) => number | undefined) =>
        availableAthletes.length > 0
          ? availableAthletes.reduce((sum, a) => sum + (pick(a) ?? 0), 0) /
            availableAthletes.length
          : 0
      const avgTravel = avgOf((a) => a.travelMinutes)
      const avgWalking = avgOf((a) => a.walkingMinutes)
      const avgDriving = avgOf((a) => a.drivingMinutes)

      results.push({
        day: dayLabels[day],
        startTime: slotStart,
        endTime: slotEnd,
        availableAthletes,
        unavailableAthletes,
        availableCount: availableAthletes.length,
        totalCount: athletes.length,
        averageTravelMinutes: Math.round(avgTravel),
        averageWalkingMinutes: avgWalking > 0 ? Math.round(avgWalking) : undefined,
        averageDrivingMinutes: avgDriving > 0 ? Math.round(avgDriving) : undefined,
      })
    }
  }

  debugLog(
    `main pass: ${days.length}days × up to ${timeSlots.length}slots = ` +
      `${results.length} feasible 90-min slots in ${((Date.now() - mainStart) / 1000).toFixed(1)}s`
  )

  // Per-day plannings, with ad-hoc duration adjustments: collective sessions
  // try to extend to 2h, individuals run at 60min (or 45 fallback). Each
  // day pushes its own decision lines into the trace.
  const dailyPlannings = await buildDailyPlannings(results, athletes, cfg, debugLog)

  // Legacy aggregated view, derived from dailyPlannings, kept so the existing
  // dashboard / planning emails keep rendering during the UI migration.
  results.sort((a, b) => {
    if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount
    return a.averageTravelMinutes - b.averageTravelMinutes
  })
  const bestSlot = pickBestSlotFromPlannings(dailyPlannings, results)
  const individualSlots = collectIndividualSlots(dailyPlannings)

  return {
    dailyPlannings,
    bestSlot,
    individualSlots,
    allSlots: results.slice(0, 5),
    calculatedAt: new Date(),
    debug,
  }
}

type DebugSink = (line: string) => void

function getStartHour(startTime: string): number {
  return Number(startTime.split(":")[0])
}

/**
 * Single-slot availability check for one athlete. Wraps the
 * departure / overlap / travel / return chain so the post-processing step
 * can re-check at any duration (extending collective to 2h, fitting an
 * individual into 60 or 45 min) without duplicating the logic that lives in
 * the main slot enumeration.
 */
async function checkAthleteForSlot(
  athlete: AthleteData,
  day: DayKey,
  slotStart: string,
  slotEnd: string,
  config: CampaignConfig
): Promise<AthleteSlotInfo> {
  const daySchedule = athlete.schedule[day] || []
  const departure = getDepartureInfo(
    daySchedule,
    slotStart,
    athlete.homeAddress,
    athlete.schoolAddress
  )

  if (departure.conflict) {
    return {
      athleteId: athlete.athleteId,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      available: false,
      reason: departure.conflictReason,
    }
  }

  const overlap = getOverlapConflict(daySchedule, slotStart, slotEnd)
  if (overlap.conflict) {
    return {
      athleteId: athlete.athleteId,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      available: false,
      reason: overlap.reason,
    }
  }

  const travel = await fetchTravel(departure.address, config.trainingLocation, day, config)

  if (!travel) {
    return {
      athleteId: athlete.athleteId,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      available: true,
      departureAddress: departure.label,
    }
  }

  // Use the fastest mode for feasibility. Walking time can be unrealistic
  // for far destinations (Google returns multi-hour walks for 20+ km),
  // and athletes pick whichever mode actually works for them. Both modes
  // are surfaced to the UI separately so the athlete still sees the slower
  // option if they care.
  const travelMinutes = Math.min(travel.walkingMinutes, travel.drivingMinutes)
  const availableFromMinutes = departure.availableFromTime
    ? timeToMinutes(departure.availableFromTime)
    : 0
  const arrivalMinutes = availableFromMinutes + travelMinutes
  const slotStartMinutes = timeToMinutes(slotStart)
  const requiredArrivalMinutes =
    availableFromMinutes > 0
      ? slotStartMinutes - CHANGING_BUFFER_MINUTES
      : slotStartMinutes

  if (arrivalMinutes > requiredArrivalMinutes) {
    return {
      athleteId: athlete.athleteId,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      available: false,
      reason: `Trajet depuis ${departure.label} : ${travel.drivingMinutes} min en voiture — arrivée estimée ${minutesToTime(arrivalMinutes)}`,
      travelMinutes: travelMinutes,
      walkingMinutes: travel.walkingMinutes,
      drivingMinutes: travel.drivingMinutes,
    }
  }

  const slotEndMinutes = timeToMinutes(slotEnd)
  const returnInfo = getReturnInfo(
    daySchedule,
    slotEnd,
    athlete.homeAddress,
    athlete.schoolAddress
  )
  if (returnInfo.mustArriveByMinutes !== null) {
    const returnTravel = await fetchTravel(config.trainingLocation, returnInfo.address, day, config)
    if (returnTravel) {
      // Mirror the outbound choice: fastest mode wins for feasibility, both
      // shown to the athlete for context.
      const returnMinutes = Math.min(returnTravel.walkingMinutes, returnTravel.drivingMinutes)
      const reachByMinutes = slotEndMinutes + CHANGING_BUFFER_MINUTES + returnMinutes
      if (reachByMinutes > returnInfo.mustArriveByMinutes) {
        return {
          athleteId: athlete.athleteId,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          available: false,
          reason: `Trajet retour vers ${returnInfo.label} : ${returnTravel.drivingMinutes} min en voiture — n'arrive pas avant ${minutesToTime(returnInfo.mustArriveByMinutes)}`,
          travelMinutes: travelMinutes,
          walkingMinutes: travel.walkingMinutes,
          drivingMinutes: travel.drivingMinutes,
        }
      }
    }
  }

  return {
    athleteId: athlete.athleteId,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    available: true,
    travelMinutes: travelMinutes,
    walkingMinutes: travel.walkingMinutes,
    drivingMinutes: travel.drivingMinutes,
    departureAddress: departure.label,
    departureTime: minutesToTime(slotStartMinutes - travelMinutes - CHANGING_BUFFER_MINUTES),
  }
}

/**
 * Convert raw per-(day, slot) scoring into the per-day plan the product wants:
 * one preferred end-of-day session + an optional morning session that can
 * be either a single big collective (≥5 athletes) or one or more individual
 * back-to-back sessions when fewer athletes are available in the morning.
 *
 * Sessions are then sized to product spec:
 *   - Collective: 90 min by default, extended to 120 min when every
 *     participating athlete can stay the extra 30 min.
 *   - Individual: 60 min by default, falling back to 45 min if a tighter
 *     window is the only one that fits the athlete.
 */
async function buildDailyPlannings(
  results: SlotResult[],
  athletes: AthleteData[],
  config: CampaignConfig,
  debug?: DebugSink
): Promise<DailyPlanning[]> {
  // Each day is independent — Promise.all runs them concurrently. The travel
  // cache is shared across days, so concurrent fetches for the same pair may
  // race once but converge to the same value (the second fetch hits the
  // cache the first one wrote).
  // Each day collects its own debug lines locally, then we drain them in
  // dayKeys order at the end. With Promise.all running days concurrently a
  // shared sink would interleave lines from different days, hurting
  // readability of the trace.
  const perDayDebug: string[][] = dayKeys.map(() => [])
  const plannings = await Promise.all(
    dayKeys.map(async (day, dayIdx) => {
      const dayLabel = dayLabels[day]
      const localDebug: DebugSink = (line) => perDayDebug[dayIdx].push(line)

      const daySlots = results.filter(
        (r) => r.day === dayLabel && r.availableCount > 0
      )

      const endOfDayCandidates = daySlots.filter((s) => {
        const h = getStartHour(s.startTime)
        return h >= END_OF_DAY_WINDOW_START_HOUR && h < END_OF_DAY_WINDOW_END_HOUR
      })

      let endOfDaySession: DailySession | null = null
      if (endOfDayCandidates.length > 0) {
        endOfDayCandidates.sort((a, b) => {
          if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount
          const sa = timeToMinutes(a.startTime)
          const sb = timeToMinutes(b.startTime)
          if (sa !== sb) return sa - sb
          return a.averageTravelMinutes - b.averageTravelMinutes
        })
        const best = endOfDayCandidates[0]
        localDebug(
          `${day} end-of-day: ${endOfDayCandidates.length} candidates, ` +
            `picked ${best.startTime}-${best.endTime} ` +
            `(${best.availableCount}/${athletes.length} athletes, ` +
            `avgTravel=${best.averageTravelMinutes}min)`
        )

        if (best.availableCount >= 2) {
          endOfDaySession = await buildCollectiveSession(
            best,
            day,
            athletes,
            config,
            localDebug
          )
        } else {
          endOfDaySession = await buildIndividualSession(
            best,
            day,
            athletes,
            config,
            localDebug
          )
        }
      } else {
        localDebug(`${day} end-of-day: no feasible slot in 16h-21h window`)
      }

      const morningSessions = await scheduleMorningSessions(
        day,
        athletes,
        config,
        localDebug
      )

      return {
        day: dayLabel,
        dayKey: day,
        endOfDaySession,
        morningSessions,
      } as DailyPlanning
    })
  )

  // Drain per-day buffers in dayKeys order so the trace reads sequentially
  // (Sun, Mon, …, Sat) regardless of the concurrent execution above.
  if (debug) {
    for (const lines of perDayDebug) {
      for (const line of lines) debug(line)
    }
  }

  return plannings
}

/**
 * Build a collective session from the chosen 90-min slot, attempting to
 * extend it to 120 min when every athlete in the slot can stay the extra
 * 30 min (no upcoming class / home obligation that would force an early
 * exit). Falls back to the 90-min slot when at least one athlete can't
 * extend.
 */
async function buildCollectiveSession(
  slot: SlotResult,
  day: DayKey,
  athletes: AthleteData[],
  config: CampaignConfig,
  debug?: DebugSink
): Promise<DailySession> {
  const baseEnd = timeToMinutes(slot.startTime) + COLLECTIVE_BASE_DURATION_MINUTES
  const extendedEnd = timeToMinutes(slot.startTime) + COLLECTIVE_EXTENDED_DURATION_MINUTES
  const extendedEndStr = minutesToTime(extendedEnd)
  const fitsTimeRange = extendedEnd <= timeToMinutes(config.timeRangeEnd)

  // Re-check every athlete already in the slot at the longer duration. If
  // any drops out (overlap / return-leg miss) we keep the 90-min version.
  let canExtend = false
  let extendedAvailable: AthleteSlotInfo[] = slot.availableAthletes
  if (fitsTimeRange) {
    const ids = new Set(slot.availableAthletes.map((a) => a.athleteId))
    const inSlot = athletes.filter((a) => ids.has(a.athleteId))
    const checks = await Promise.all(
      inSlot.map((a) =>
        checkAthleteForSlot(a, day, slot.startTime, extendedEndStr, config)
      )
    )
    if (checks.every((c) => c.available)) {
      canExtend = true
      extendedAvailable = checks
    } else {
      // Surface which athlete blocked the extension and why — useful when
      // you wonder why some days are 1h30 and others 2h.
      const blocked = checks.find((c) => !c.available)
      debug?.(
        `${day} extend 90→120 blocked: ${blocked?.firstName ?? "?"} — ${blocked?.reason ?? "unknown"}`
      )
    }
  } else {
    debug?.(`${day} extend 90→120 skipped: would exceed campaign time range`)
  }

  const endTime = canExtend ? extendedEndStr : minutesToTime(baseEnd)
  const duration = canExtend
    ? COLLECTIVE_EXTENDED_DURATION_MINUTES
    : COLLECTIVE_BASE_DURATION_MINUTES
  const finalAthletes = canExtend ? extendedAvailable : slot.availableAthletes
  if (canExtend) {
    debug?.(
      `${day} extend 90→120 ok (${finalAthletes.length} athletes stay until ${extendedEndStr})`
    )
  }

  const avgOf = (pick: (a: AthleteSlotInfo) => number | undefined) =>
    finalAthletes.length > 0
      ? finalAthletes.reduce((sum, a) => sum + (pick(a) ?? 0), 0) /
        finalAthletes.length
      : 0
  const avgTravel = Math.round(avgOf((a) => a.travelMinutes))
  const avgWalking = avgOf((a) => a.walkingMinutes)
  const avgDriving = avgOf((a) => a.drivingMinutes)

  return {
    type: "collective",
    startTime: slot.startTime,
    endTime,
    durationMinutes: duration,
    athletes: finalAthletes,
    averageTravelMinutes: avgTravel,
    averageWalkingMinutes: avgWalking > 0 ? Math.round(avgWalking) : undefined,
    averageDrivingMinutes: avgDriving > 0 ? Math.round(avgDriving) : undefined,
  }
}

/**
 * Build a 1-athlete individual session. We re-check at 60 min (default) and
 * fall back to 45 min if needed. The base 90-min slot is used as a last
 * resort — should not happen in practice since shorter durations are
 * strictly easier on overlap and return-leg constraints, but we keep the
 * fallback so we never lose a session that the 90-min pass had already
 * found feasible.
 */
async function buildIndividualSession(
  slot: SlotResult,
  day: DayKey,
  athletes: AthleteData[],
  config: CampaignConfig,
  debug?: DebugSink
): Promise<DailySession | null> {
  const athleteInfo = slot.availableAthletes[0]
  if (!athleteInfo) return null
  const athlete = athletes.find((a) => a.athleteId === athleteInfo.athleteId)
  if (!athlete) return null

  for (const duration of [INDIVIDUAL_DURATION_MINUTES, INDIVIDUAL_FALLBACK_DURATION_MINUTES]) {
    const endStr = minutesToTime(timeToMinutes(slot.startTime) + duration)
    if (timeToMinutes(endStr) > timeToMinutes(config.timeRangeEnd)) continue
    const info = await checkAthleteForSlot(athlete, day, slot.startTime, endStr, config)
    if (!info.available) continue
    debug?.(
      `${day} end-of-day individual: ${athlete.firstName} ${slot.startTime}-${endStr} (${duration}min)`
    )
    return {
      type: "individual",
      startTime: slot.startTime,
      endTime: endStr,
      durationMinutes: duration,
      athletes: [info],
      averageTravelMinutes: info.travelMinutes ?? 0,
      averageWalkingMinutes: info.walkingMinutes,
      averageDrivingMinutes: info.drivingMinutes,
    }
  }
  // Should be unreachable since the 90-min slot was feasible, but keep a
  // graceful fallback to the original slot rather than dropping the session.
  debug?.(
    `${day} end-of-day individual fallback: ${athlete.firstName} kept at original 90-min slot`
  )
  return {
    type: "individual",
    startTime: slot.startTime,
    endTime: slot.endTime,
    durationMinutes: COLLECTIVE_BASE_DURATION_MINUTES,
    athletes: [athleteInfo],
    averageTravelMinutes: slot.averageTravelMinutes,
    averageWalkingMinutes: slot.averageWalkingMinutes,
    averageDrivingMinutes: slot.averageDrivingMinutes,
  }
}

// Maximum number of athletes in a "grouped individual" morning session.
// Above this threshold the slot becomes a true collective (handled in the
// 90-min branch). Goal: cap individual feel while keeping coach hours short
// when several athletes happen to be free at the same time.
const INDIVIDUAL_GROUP_MAX_ATHLETES = 4

/**
 * Greedy scheduler for morning sessions with grouping. For every slot start
 * in the morning window we compute three pools:
 *   - pool90: athletes available for a 90-min slot (collective candidate),
 *   - pool60: athletes available for a 60-min slot (grouped individual),
 *   - pool45: athletes available for a 45-min slot (fallback grouped indiv).
 *
 * On each iteration we pick the (slot, duration, type) that places the most
 * unplaced athletes, with this priority order:
 *   1. ≥5 athletes share a 90-min start  → collective 90 (try extend to 120).
 *   2. 1–4 athletes share a 60-min start → individual 60.
 *   3. 1–4 athletes share a 45-min start → individual 45.
 *
 * Placed athletes are removed from later slots' candidate pools, so we keep
 * scheduling until no slot has any unplaced athlete left.
 */
async function scheduleMorningSessions(
  day: DayKey,
  athletes: AthleteData[],
  config: CampaignConfig,
  debug?: DebugSink
): Promise<DailySession[]> {
  // Slot starts in the morning window, bounded by the campaign's own
  // timeRangeStart. Step matches the main pass (15 min) so the per-day
  // patterns line up.
  const windowStartMinutes = Math.max(
    timeToMinutes(`${MORNING_WINDOW_START_HOUR.toString().padStart(2, "0")}:00`),
    timeToMinutes(config.timeRangeStart)
  )
  const windowEndMinutes = timeToMinutes(
    `${MORNING_WINDOW_END_HOUR.toString().padStart(2, "0")}:00`
  )
  const slotStarts: string[] = []
  for (let m = windowStartMinutes; m < windowEndMinutes; m += SLOT_STEP_MINUTES) {
    slotStarts.push(minutesToTime(m))
  }

  type SlotInfo = {
    startTime: string
    pool90: AthleteSlotInfo[]
    pool60: AthleteSlotInfo[]
    pool45: AthleteSlotInfo[]
  }

  // Compute athlete availability per slot at all three durations. We fetch
  // them concurrently per slot so the in-memory travel cache stays warm.
  const slots: SlotInfo[] = []
  for (const startTime of slotStarts) {
    if (!isSlotAllowed(config.availableSlots, day, startTime)) continue
    const startMin = timeToMinutes(startTime)
    const tEnd = timeToMinutes(config.timeRangeEnd)

    const checks = await Promise.all(
      athletes.flatMap((a) => {
        const calls: Promise<{ duration: number; info: AthleteSlotInfo }>[] = []
        for (const duration of [
          COLLECTIVE_BASE_DURATION_MINUTES,
          INDIVIDUAL_DURATION_MINUTES,
          INDIVIDUAL_FALLBACK_DURATION_MINUTES,
        ]) {
          if (startMin + duration > tEnd) continue
          calls.push(
            checkAthleteForSlot(
              a,
              day,
              startTime,
              minutesToTime(startMin + duration),
              config
            ).then((info) => ({ duration, info }))
          )
        }
        return calls
      })
    )

    const pool90: AthleteSlotInfo[] = []
    const pool60: AthleteSlotInfo[] = []
    const pool45: AthleteSlotInfo[] = []
    for (const { duration, info } of checks) {
      if (!info.available) continue
      if (duration === COLLECTIVE_BASE_DURATION_MINUTES) pool90.push(info)
      else if (duration === INDIVIDUAL_DURATION_MINUTES) pool60.push(info)
      else pool45.push(info)
    }

    if (pool90.length === 0 && pool60.length === 0 && pool45.length === 0) continue
    slots.push({ startTime, pool90, pool60, pool45 })
  }

  // Per-day summary: how many slots had any availability and the peak pool
  // size at each duration. Tells us at a glance whether the algo had room
  // to work or the data was simply too tight.
  const peak = (pool: keyof Pick<SlotInfo, "pool90" | "pool60" | "pool45">) =>
    slots.reduce((m, s) => Math.max(m, s[pool].length), 0)
  debug?.(
    `${day} morning: viableSlots=${slots.length} ` +
      `peak90=${peak("pool90")} peak60=${peak("pool60")} peak45=${peak("pool45")} ` +
      `athletes=${athletes.length}`
  )

  const occupied: Array<{ start: number; end: number }> = []
  const placedIds = new Set<string>()
  const sessions: DailySession[] = []

  function overlaps(start: number, end: number): boolean {
    return occupied.some((r) => r.start < end && r.end > start)
  }

  function avg(athletes: AthleteSlotInfo[], pick: (a: AthleteSlotInfo) => number | undefined): number {
    if (athletes.length === 0) return 0
    return athletes.reduce((sum, a) => sum + (pick(a) ?? 0), 0) / athletes.length
  }

  while (true) {
    let best: {
      slot: SlotInfo
      pool: AthleteSlotInfo[]
      duration: number
      type: "collective" | "individual"
    } | null = null

    for (const s of slots) {
      const start = timeToMinutes(s.startTime)
      const unplaced = (pool: AthleteSlotInfo[]) =>
        pool.filter((a) => !placedIds.has(a.athleteId))

      // Tier 1: ≥5 athletes can share 90 min → morning collective.
      const u90 = unplaced(s.pool90)
      if (u90.length >= MORNING_COLLECTIVE_MIN_ATHLETES) {
        if (!overlaps(start, start + COLLECTIVE_BASE_DURATION_MINUTES)) {
          if (!best || u90.length > best.pool.length) {
            best = {
              slot: s,
              pool: u90,
              duration: COLLECTIVE_BASE_DURATION_MINUTES,
              type: "collective",
            }
          }
          continue
        }
      }

      // Tier 2: 1–4 athletes share 60 min → grouped individual at 60.
      const u60 = unplaced(s.pool60).slice(0, INDIVIDUAL_GROUP_MAX_ATHLETES)
      if (u60.length >= 1) {
        if (!overlaps(start, start + INDIVIDUAL_DURATION_MINUTES)) {
          if (!best || u60.length > best.pool.length) {
            best = {
              slot: s,
              pool: u60,
              duration: INDIVIDUAL_DURATION_MINUTES,
              type: "individual",
            }
          }
          continue
        }
      }

      // Tier 3: 1–4 athletes share 45 min → grouped individual at 45 (fallback).
      const u45 = unplaced(s.pool45).slice(0, INDIVIDUAL_GROUP_MAX_ATHLETES)
      if (u45.length >= 1) {
        if (!overlaps(start, start + INDIVIDUAL_FALLBACK_DURATION_MINUTES)) {
          if (!best || u45.length > best.pool.length) {
            best = {
              slot: s,
              pool: u45,
              duration: INDIVIDUAL_FALLBACK_DURATION_MINUTES,
              type: "individual",
            }
          }
        }
      }
    }

    if (!best || best.pool.length === 0) break

    let finalAthletes = best.pool
    let endMinutes = timeToMinutes(best.slot.startTime) + best.duration
    let duration = best.duration

    // Collective 90 → try extending to 120 if every athlete can stay.
    if (best.type === "collective") {
      const extEnd = timeToMinutes(best.slot.startTime) + COLLECTIVE_EXTENDED_DURATION_MINUTES
      if (extEnd <= timeToMinutes(config.timeRangeEnd)) {
        const extEndStr = minutesToTime(extEnd)
        const ids = new Set(best.pool.map((a) => a.athleteId))
        const inSlot = athletes.filter((a) => ids.has(a.athleteId))
        const checks = await Promise.all(
          inSlot.map((a) => checkAthleteForSlot(a, day, best.slot.startTime, extEndStr, config))
        )
        if (checks.every((c) => c.available)) {
          finalAthletes = checks
          endMinutes = extEnd
          duration = COLLECTIVE_EXTENDED_DURATION_MINUTES
        }
      }
    }

    sessions.push({
      type: best.type,
      startTime: best.slot.startTime,
      endTime: minutesToTime(endMinutes),
      durationMinutes: duration,
      athletes: finalAthletes,
      averageTravelMinutes: Math.round(avg(finalAthletes, (a) => a.travelMinutes)),
      averageWalkingMinutes:
        avg(finalAthletes, (a) => a.walkingMinutes) > 0
          ? Math.round(avg(finalAthletes, (a) => a.walkingMinutes))
          : undefined,
      averageDrivingMinutes:
        avg(finalAthletes, (a) => a.drivingMinutes) > 0
          ? Math.round(avg(finalAthletes, (a) => a.drivingMinutes))
          : undefined,
    })

    debug?.(
      `${day} morning placed ${best.slot.startTime}-${minutesToTime(endMinutes)} ` +
        `${best.type} (${duration}min) [${finalAthletes.map((a) => a.firstName).join(", ")}]`
    )

    finalAthletes.forEach((a) => placedIds.add(a.athleteId))
    occupied.push({ start: timeToMinutes(best.slot.startTime), end: endMinutes })
  }

  // Anyone left unplaced — surfaces athletes whose schedule never lined up
  // with a feasible morning slot. Useful to spot tight schedules early.
  const unplacedNames = athletes
    .filter((a) => !placedIds.has(a.athleteId))
    .map((a) => a.firstName)
  if (unplacedNames.length > 0) {
    debug?.(`${day} morning unplaced: ${unplacedNames.join(", ")}`)
  }

  return sessions.sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  )
}

/**
 * Pick the SlotResult the legacy dashboard UI should surface as the headline
 * "best slot". The product preference is end-of-day, so we look in this order:
 *
 *   1. The strongest end-of-day collective across the week.
 *   2. If no end-of-day collective exists (e.g. only one athlete responded),
 *      the best end-of-day individual session — still respects "fin de
 *      journée" rather than letting a morning individual win on travel time.
 *   3. As a last resort, the highest-attendance slot anywhere.
 */
function pickBestSlotFromPlannings(
  plannings: DailyPlanning[],
  sortedResults: SlotResult[]
): SlotResult {
  const endOfDayCollectives = plannings
    .map((p) => p.endOfDaySession)
    .filter((s): s is DailySession => s !== null && s.type === "collective")

  if (endOfDayCollectives.length > 0) {
    const best = endOfDayCollectives.reduce((acc, cur) => {
      if (cur.athletes.length !== acc.athletes.length) {
        return cur.athletes.length > acc.athletes.length ? cur : acc
      }
      return cur.averageTravelMinutes < acc.averageTravelMinutes ? cur : acc
    })
    const bestPlanning = plannings.find((p) => p.endOfDaySession === best)
    const matching = sortedResults.find(
      (r) => r.day === bestPlanning?.day && r.startTime === best.startTime
    )
    if (matching) return matching
  }

  const endOfDayAny = plannings
    .map((p) => p.endOfDaySession)
    .filter((s): s is DailySession => s !== null)

  if (endOfDayAny.length > 0) {
    // Earliest start wins (consistent with buildDailyPlannings: schedule the
    // session as soon as the group is available), tiebreak by attendance,
    // then by travel time.
    const best = endOfDayAny.reduce((acc, cur) => {
      const accStart = timeToMinutes(acc.startTime)
      const curStart = timeToMinutes(cur.startTime)
      if (curStart !== accStart) return curStart < accStart ? cur : acc
      if (cur.athletes.length !== acc.athletes.length) {
        return cur.athletes.length > acc.athletes.length ? cur : acc
      }
      return cur.averageTravelMinutes < acc.averageTravelMinutes ? cur : acc
    })
    const bestPlanning = plannings.find((p) => p.endOfDaySession === best)
    const matching = sortedResults.find(
      (r) => r.day === bestPlanning?.day && r.startTime === best.startTime
    )
    if (matching) return matching
  }

  return sortedResults[0]
}

function collectIndividualSlots(plannings: DailyPlanning[]): IndividualSlot[] {
  const out: IndividualSlot[] = []
  for (const planning of plannings) {
    for (const session of planning.morningSessions) {
      // Morning individuals can now group up to 4 athletes per slot. Emit
      // one IndividualSlot row per athlete so the legacy flat list still
      // produces a per-athlete breakdown for downstream consumers.
      if (session.type !== "individual") continue
      for (const a of session.athletes) {
        out.push({
          athleteId: a.athleteId,
          firstName: a.firstName,
          lastName: a.lastName,
          day: planning.day,
          startTime: session.startTime,
          endTime: session.endTime,
          travelMinutes: a.travelMinutes ?? 0,
          walkingMinutes: a.walkingMinutes,
          drivingMinutes: a.drivingMinutes,
          departureAddress: a.departureAddress ?? "",
          departureTime: a.departureTime ?? "",
          exclusionReason: "Séance individuelle du matin",
        })
      }
    }
    if (planning.endOfDaySession?.type === "individual") {
      const session = planning.endOfDaySession
      const a = session.athletes[0]
      if (a) {
        out.push({
          athleteId: a.athleteId,
          firstName: a.firstName,
          lastName: a.lastName,
          day: planning.day,
          startTime: session.startTime,
          endTime: session.endTime,
          travelMinutes: a.travelMinutes ?? 0,
          walkingMinutes: a.walkingMinutes,
          drivingMinutes: a.drivingMinutes,
          departureAddress: a.departureAddress ?? "",
          departureTime: a.departureTime ?? "",
          exclusionReason: "Séance individuelle de fin de journée",
        })
      }
    }
  }
  return out
}
