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
import { getTravelTime } from "./travel"

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

  // Pre-warm the travel-time cache in parallel. Every inner call then hits
  // the cache and runs synchronously. We warm BOTH directions: the trip to
  // the training and the return trip to the athlete's next location.
  const departurePairs = enumerateUniqueTravelPairs(athletes)
  const returnPairs = enumerateUniqueReturnPairs(athletes)
  const allPairs: Array<{
    origin: AddressWithCoords
    destination: AddressWithCoords
    day: DayKey
  }> = [
    ...departurePairs.map((p) => ({
      origin: p.origin,
      destination: config.trainingLocation,
      day: p.day,
    })),
    ...returnPairs.map((p) => ({
      origin: config.trainingLocation,
      destination: p.destination,
      day: p.day,
    })),
  ]
  if (allPairs.length > 0) {
    const warmupResults = await Promise.all(
      allPairs.map(({ origin, destination, day }) =>
        getTravelTime(
          origin,
          destination,
          day,
          config.managerUid,
          config.groupId,
          config.campaignId
        )
      )
    )
    const failures = warmupResults.filter((r) => r === null).length
    if (failures / warmupResults.length > MAPS_FAILURE_ABORT_RATIO) {
      throw new MapsUnavailableError()
    }
  }

  const results: SlotResult[] = []

  for (const day of days) {
    for (const slotStart of timeSlots) {
      const slotEnd = minutesToTime(timeToMinutes(slotStart) + SLOT_DURATION_MINUTES)
      if (timeToMinutes(slotEnd) > timeToMinutes(config.timeRangeEnd)) continue

      // Hard filter: coach + facility must be available for this slot's hour.
      if (!isSlotAllowed(config.availableSlots, day, slotStart)) continue

      const checks = await Promise.all(
        athletes.map((a) => checkAthleteForSlot(a, day, slotStart, slotEnd, config))
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

  // Per-day plannings, with ad-hoc duration adjustments: collective sessions
  // try to extend to 2h, individuals run at 60min (or 45 fallback).
  const dailyPlannings = await buildDailyPlannings(results, athletes, config)

  // Lightweight telemetry: log a per-day summary when no morning session was
  // produced. Surfaces in Cloud Run logs and lets us tell apart "the data
  // genuinely has no morning availability" from "the algo missed a slot".
  for (const planning of dailyPlannings) {
    if (planning.morningSessions.length === 0) {
      console.info(
        `[OPTIMIZER] ${config.campaignId} ${planning.day}: 0 morning sessions ` +
          `(end-of-day=${planning.endOfDaySession ? planning.endOfDaySession.startTime : "none"})`
      )
    }
  }

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
  }
}

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

  const travel = await getTravelTime(
    departure.address,
    config.trainingLocation,
    day,
    config.managerUid,
    config.groupId,
    config.campaignId
  )

  if (!travel) {
    return {
      athleteId: athlete.athleteId,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      available: true,
      departureAddress: departure.label,
    }
  }

  const worstTravel = Math.max(travel.walkingMinutes, travel.drivingMinutes)
  const availableFromMinutes = departure.availableFromTime
    ? timeToMinutes(departure.availableFromTime)
    : 0
  const arrivalMinutes = availableFromMinutes + worstTravel
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
      reason: `Trajet depuis ${departure.label} : à pied ${travel.walkingMinutes} min, en voiture ${travel.drivingMinutes} min — arrivée estimée ${minutesToTime(arrivalMinutes)}`,
      travelMinutes: worstTravel,
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
    const returnTravel = await getTravelTime(
      config.trainingLocation,
      returnInfo.address,
      day,
      config.managerUid,
      config.groupId,
      config.campaignId
    )
    if (returnTravel) {
      const worstReturn = Math.max(returnTravel.walkingMinutes, returnTravel.drivingMinutes)
      const reachByMinutes = slotEndMinutes + CHANGING_BUFFER_MINUTES + worstReturn
      if (reachByMinutes > returnInfo.mustArriveByMinutes) {
        return {
          athleteId: athlete.athleteId,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          available: false,
          reason: `Trajet retour vers ${returnInfo.label} : à pied ${returnTravel.walkingMinutes} min, en voiture ${returnTravel.drivingMinutes} min — n'arrive pas avant ${minutesToTime(returnInfo.mustArriveByMinutes)}`,
          travelMinutes: worstTravel,
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
    travelMinutes: worstTravel,
    walkingMinutes: travel.walkingMinutes,
    drivingMinutes: travel.drivingMinutes,
    departureAddress: departure.label,
    departureTime: minutesToTime(
      slotStartMinutes - worstTravel - CHANGING_BUFFER_MINUTES
    ),
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
  config: CampaignConfig
): Promise<DailyPlanning[]> {
  const out: DailyPlanning[] = []
  for (const day of dayKeys) {
    const dayLabel = dayLabels[day]
    const daySlots = results.filter(
      (r) => r.day === dayLabel && r.availableCount > 0
    )

    const endOfDayCandidates = daySlots.filter((s) => {
      const h = getStartHour(s.startTime)
      return h >= END_OF_DAY_WINDOW_START_HOUR && h < END_OF_DAY_WINDOW_END_HOUR
    })

    let endOfDaySession: DailySession | null = null
    if (endOfDayCandidates.length > 0) {
      // Most athletes first; tiebreak: EARLIEST start (so the session lands as
      // soon as everyone is available rather than getting pushed to 20h–21h30
      // when classes finished much earlier), then lowest average travel.
      endOfDayCandidates.sort((a, b) => {
        if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount
        const sa = timeToMinutes(a.startTime)
        const sb = timeToMinutes(b.startTime)
        if (sa !== sb) return sa - sb
        return a.averageTravelMinutes - b.averageTravelMinutes
      })
      const best = endOfDayCandidates[0]

      if (best.availableCount >= 2) {
        endOfDaySession = await buildCollectiveSession(
          best,
          day,
          athletes,
          config
        )
      } else {
        endOfDaySession = await buildIndividualSession(best, day, athletes, config)
      }
    }

    const morningCollectiveCandidates = daySlots.filter((s) => {
      const h = getStartHour(s.startTime)
      return h >= MORNING_WINDOW_START_HOUR && h < MORNING_WINDOW_END_HOUR
    })

    const morningSessions: DailySession[] = []
    if (morningCollectiveCandidates.length > 0) {
      const peak = [...morningCollectiveCandidates].sort((a, b) => {
        if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount
        return timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
      })[0]

      if (peak.availableCount >= MORNING_COLLECTIVE_MIN_ATHLETES) {
        const collective = await buildCollectiveSession(peak, day, athletes, config)
        if (collective) morningSessions.push(collective)
      }
    }

    if (morningSessions.length === 0) {
      // Below the collective threshold (or no morning peak at all): try to
      // place each athlete in their own short individual slot. We compute
      // 60-min and 45-min options ad-hoc here because the main pass only
      // enumerates 90-min slots, which can miss tight gaps that fit a
      // 60-min individual.
      const individuals = await scheduleMorningIndividualsAtFlexibleDuration(
        day,
        athletes,
        config
      )
      morningSessions.push(...individuals)
    }

    out.push({
      day: dayLabel,
      dayKey: day,
      endOfDaySession,
      morningSessions,
    })
  }
  return out
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
  config: CampaignConfig
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
    }
  }

  const endTime = canExtend ? extendedEndStr : minutesToTime(baseEnd)
  const duration = canExtend
    ? COLLECTIVE_EXTENDED_DURATION_MINUTES
    : COLLECTIVE_BASE_DURATION_MINUTES
  const finalAthletes = canExtend ? extendedAvailable : slot.availableAthletes

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
  config: CampaignConfig
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

/**
 * Greedy scheduler for morning individual sessions at variable duration.
 *
 * Per athlete, we enumerate every 60-min start that fits the morning window,
 * the campaign time range, and the coach availability grid. We then pick the
 * earliest non-overlapping slot, falling back to a 45-min start if no 60-min
 * option works (e.g. another athlete was placed earlier and the only
 * remaining gap is shorter).
 *
 * Athletes with fewer 60-min options are scheduled first, mirroring the
 * previous "least flexible first" heuristic so a constrained athlete doesn't
 * get squeezed out by a flexible one taking the last big slot.
 */
async function scheduleMorningIndividualsAtFlexibleDuration(
  day: DayKey,
  athletes: AthleteData[],
  config: CampaignConfig
): Promise<DailySession[]> {
  type Option = { startTime: string; endTime: string; duration: number; info: AthleteSlotInfo }

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

  async function findOptions(
    athlete: AthleteData,
    duration: number
  ): Promise<Option[]> {
    const out: Option[] = []
    for (const startTime of slotStarts) {
      const endMin = timeToMinutes(startTime) + duration
      if (endMin > timeToMinutes(config.timeRangeEnd)) continue
      const endStr = minutesToTime(endMin)
      if (!isSlotAllowed(config.availableSlots, day, startTime)) continue
      const info = await checkAthleteForSlot(athlete, day, startTime, endStr, config)
      if (info.available) out.push({ startTime, endTime: endStr, duration, info })
    }
    return out
  }

  // Pre-compute 60-min options for every athlete so we can sort by least
  // flexible first. Athletes with zero 60-min options stay in the list so
  // they still get a chance at the 45-min fallback below — dropping them
  // here was a bug that ruled them out before that fallback could run.
  const perAthlete: Array<{ athlete: AthleteData; options60: Option[] }> = []
  for (const athlete of athletes) {
    const options60 = await findOptions(athlete, INDIVIDUAL_DURATION_MINUTES)
    perAthlete.push({ athlete, options60 })
  }
  console.info(
    `[OPTIMIZER] ${config.campaignId} ${day} morning scheduler: ${perAthlete.length} athletes, ` +
      `options60=[${perAthlete.map((p) => `${p.athlete.firstName}:${p.options60.length}`).join(", ")}], ` +
      `slotStarts=${slotStarts.length}, window=[${minutesToTime(windowStartMinutes)}-${minutesToTime(windowEndMinutes)}]`
  )

  // For each athlete + slot, dump the first availability check failure so we
  // can spot whether departure / overlap / travel / return is the blocker.
  for (const { athlete, options60 } of perAthlete) {
    if (options60.length > 0) continue
    const reasons: string[] = []
    for (const startTime of slotStarts.slice(0, 6)) {
      const endStr = minutesToTime(timeToMinutes(startTime) + INDIVIDUAL_DURATION_MINUTES)
      const info = await checkAthleteForSlot(athlete, day, startTime, endStr, config)
      if (!info.available) {
        reasons.push(`${startTime}: ${info.reason ?? "?"}`)
      }
    }
    console.info(
      `[OPTIMIZER] ${config.campaignId} ${day} ${athlete.firstName} no 60-min options. ` +
        `First reasons: ${reasons.join(" | ")}`
    )
  }
  // Least flexible first — athletes with fewer 60-min options (0 included)
  // are scheduled before flexible ones so a constrained athlete doesn't
  // lose their only window to one with many alternatives.
  perAthlete.sort((a, b) => a.options60.length - b.options60.length)

  const occupied: Array<{ start: number; end: number }> = []
  const sessions: DailySession[] = []

  function overlaps(start: number, end: number): boolean {
    return occupied.some((r) => r.start < end && r.end > start)
  }

  function tryPlace(options: Option[]): Option | null {
    const earliestFirst = [...options].sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    )
    for (const opt of earliestFirst) {
      const startMin = timeToMinutes(opt.startTime)
      const endMin = timeToMinutes(opt.endTime)
      if (overlaps(startMin, endMin)) continue
      occupied.push({ start: startMin, end: endMin })
      return opt
    }
    return null
  }

  for (const { athlete, options60 } of perAthlete) {
    let placed = tryPlace(options60)
    if (!placed) {
      const options45 = await findOptions(athlete, INDIVIDUAL_FALLBACK_DURATION_MINUTES)
      placed = tryPlace(options45)
    }
    if (!placed) continue
    sessions.push({
      type: "individual",
      startTime: placed.startTime,
      endTime: placed.endTime,
      durationMinutes: placed.duration,
      athletes: [placed.info],
      averageTravelMinutes: placed.info.travelMinutes ?? 0,
      averageWalkingMinutes: placed.info.walkingMinutes,
      averageDrivingMinutes: placed.info.drivingMinutes,
    })
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
      if (session.type !== "individual" || session.athletes.length !== 1) continue
      const a = session.athletes[0]
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
