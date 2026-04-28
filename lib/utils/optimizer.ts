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
const SLOT_DURATION_MINUTES = 90
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

      const availableAthletes: AthleteSlotInfo[] = []
      const unavailableAthletes: AthleteSlotInfo[] = []

      for (const athlete of athletes) {
        const daySchedule = athlete.schedule[day] || []
        const departure = getDepartureInfo(daySchedule, slotStart, athlete.homeAddress, athlete.schoolAddress)

        if (departure.conflict) {
          unavailableAthletes.push({
            athleteId: athlete.athleteId,
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            available: false,
            reason: departure.conflictReason,
          })
          continue
        }

        // Mid-slot conflict: the athlete is free at slotStart but a class /
        // home obligation kicks in before slotEnd. getDepartureInfo only
        // looks at the start instant, so a 90-min slot starting at 11:15 with
        // a "school" cell at 12:00 would slip through without this check.
        const overlap = getOverlapConflict(daySchedule, slotStart, slotEnd)
        if (overlap.conflict) {
          unavailableAthletes.push({
            athleteId: athlete.athleteId,
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            available: false,
            reason: overlap.reason,
          })
          continue
        }

        // Cache hit expected (warmed above). If it's a miss here the fetch
        // will still run but this path is rare.
        const travel = await getTravelTime(
          departure.address,
          config.trainingLocation,
          day,
          config.managerUid,
          config.groupId,
          config.campaignId
        )

        if (travel) {
          // Worst-case feasibility: if even the slower mode (walking,
          // typically) can't make it on time, we exclude the athlete. This
          // matches the product call: the planning is calibrated against the
          // longer of the two modes so the slot works regardless of how the
          // athlete actually travels.
          const worstTravel = Math.max(travel.walkingMinutes, travel.drivingMinutes)
          const availableFromMinutes = departure.availableFromTime ? timeToMinutes(departure.availableFromTime) : 0
          const arrivalMinutes = availableFromMinutes + worstTravel
          const slotStartMinutes = timeToMinutes(slotStart)
          // Athlete must arrive at least CHANGING_BUFFER_MINUTES before the
          // slot starts so they can change. We only enforce this when there's
          // an upstream constraint (availableFromMinutes > 0) — without one
          // the athlete simply leaves earlier from home, no need to rule the
          // slot out.
          const requiredArrivalMinutes =
            availableFromMinutes > 0
              ? slotStartMinutes - CHANGING_BUFFER_MINUTES
              : slotStartMinutes

          if (arrivalMinutes > requiredArrivalMinutes) {
            unavailableAthletes.push({
              athleteId: athlete.athleteId,
              firstName: athlete.firstName,
              lastName: athlete.lastName,
              available: false,
              reason: `Trajet depuis ${departure.label} : à pied ${travel.walkingMinutes} min, en voiture ${travel.drivingMinutes} min — arrivée estimée ${minutesToTime(arrivalMinutes)}`,
              travelMinutes: worstTravel,
              walkingMinutes: travel.walkingMinutes,
              drivingMinutes: travel.drivingMinutes,
            })
            continue
          }

          // Return leg: can the athlete reach their next class on time after
          // training ends? If not, we mark them unavailable for this slot.
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
              // Mirror the changing buffer on the way out: we hold back the
              // same amount of minutes after the slot ends so the athlete can
              // change before heading off.
              const reachByMinutes = slotEndMinutes + CHANGING_BUFFER_MINUTES + worstReturn
              if (reachByMinutes > returnInfo.mustArriveByMinutes) {
                unavailableAthletes.push({
                  athleteId: athlete.athleteId,
                  firstName: athlete.firstName,
                  lastName: athlete.lastName,
                  available: false,
                  reason: `Trajet retour vers ${returnInfo.label} : à pied ${returnTravel.walkingMinutes} min, en voiture ${returnTravel.drivingMinutes} min — n'arrive pas avant ${minutesToTime(returnInfo.mustArriveByMinutes)}`,
                  travelMinutes: worstTravel,
                  walkingMinutes: travel.walkingMinutes,
                  drivingMinutes: travel.drivingMinutes,
                })
                continue
              }
            }
          }

          availableAthletes.push({
            athleteId: athlete.athleteId,
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            available: true,
            travelMinutes: worstTravel,
            walkingMinutes: travel.walkingMinutes,
            drivingMinutes: travel.drivingMinutes,
            departureAddress: departure.label,
            // Departure time uses the worst-case travel + the changing buffer
            // so the athlete arrives early enough to change without rushing.
            // The displayed pair lets them see the faster option if they want
            // a smaller buffer.
            departureTime: minutesToTime(
              slotStartMinutes - worstTravel - CHANGING_BUFFER_MINUTES
            ),
          })
        } else {
          availableAthletes.push({
            athleteId: athlete.athleteId,
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            available: true,
            departureAddress: departure.label,
          })
        }
      }

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

  // Per-day plannings using the new product rules (Lot 3b).
  const dailyPlannings = buildDailyPlannings(results)

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
 * Convert raw per-(day, slot) scoring into the per-day plan the product wants:
 * one preferred end-of-day collective + an optional morning session that can
 * be either a single big collective (≥5 athletes) or several back-to-back
 * individual sessions when fewer athletes are available in the morning.
 */
function buildDailyPlannings(results: SlotResult[]): DailyPlanning[] {
  return dayKeys.map((day) => {
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
      endOfDaySession = {
        type: best.availableCount >= 2 ? "collective" : "individual",
        startTime: best.startTime,
        endTime: best.endTime,
        durationMinutes: SLOT_DURATION_MINUTES,
        athletes: best.availableAthletes,
        averageTravelMinutes: best.averageTravelMinutes,
        averageWalkingMinutes: best.averageWalkingMinutes,
        averageDrivingMinutes: best.averageDrivingMinutes,
      }
    }

    const morningCandidates = daySlots.filter((s) => {
      const h = getStartHour(s.startTime)
      return h >= MORNING_WINDOW_START_HOUR && h < MORNING_WINDOW_END_HOUR
    })

    const morningSessions: DailySession[] = []
    if (morningCandidates.length > 0) {
      const sortedByAttendance = [...morningCandidates].sort((a, b) => {
        if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount
        return getStartHour(a.startTime) - getStartHour(b.startTime)
      })
      const peak = sortedByAttendance[0]

      if (peak.availableCount >= MORNING_COLLECTIVE_MIN_ATHLETES) {
        morningSessions.push({
          type: "collective",
          startTime: peak.startTime,
          endTime: peak.endTime,
          durationMinutes: SLOT_DURATION_MINUTES,
          athletes: peak.availableAthletes,
          averageTravelMinutes: peak.averageTravelMinutes,
          averageWalkingMinutes: peak.averageWalkingMinutes,
          averageDrivingMinutes: peak.averageDrivingMinutes,
        })
      } else {
        morningSessions.push(
          ...scheduleMorningIndividuals(morningCandidates)
        )
      }
    }

    return {
      day: dayLabel,
      dayKey: day,
      endOfDaySession,
      morningSessions,
    }
  })
}

/**
 * Greedy non-overlapping scheduler for individual morning sessions. Each
 * athlete gets at most one slot. Athletes with fewer available morning slots
 * are scheduled first so the constrained ones don't get squeezed out by the
 * flexible ones.
 */
function scheduleMorningIndividuals(morningCandidates: SlotResult[]): DailySession[] {
  const morningAthletes = new Map<
    string,
    { athlete: AthleteSlotInfo; slots: SlotResult[] }
  >()
  for (const slot of morningCandidates) {
    for (const a of slot.availableAthletes) {
      const entry = morningAthletes.get(a.athleteId)
      if (entry) {
        entry.slots.push(slot)
      } else {
        morningAthletes.set(a.athleteId, { athlete: a, slots: [slot] })
      }
    }
  }

  const byFlexibility = Array.from(morningAthletes.values()).sort(
    (a, b) => a.slots.length - b.slots.length
  )

  const occupiedStartMinutes = new Set<number>()
  const sessions: DailySession[] = []

  for (const { athlete, slots } of byFlexibility) {
    const earliestFirst = [...slots].sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    )
    for (const slot of earliestFirst) {
      const slotMinutes = timeToMinutes(slot.startTime)
      const overlaps = Array.from(occupiedStartMinutes).some(
        (occMinutes) => Math.abs(slotMinutes - occMinutes) < SLOT_DURATION_MINUTES
      )
      if (overlaps) continue
      const athleteInSlot = slot.availableAthletes.find(
        (x) => x.athleteId === athlete.athleteId
      )
      if (!athleteInSlot) continue
      occupiedStartMinutes.add(slotMinutes)
      sessions.push({
        type: "individual",
        startTime: slot.startTime,
        endTime: slot.endTime,
        durationMinutes: SLOT_DURATION_MINUTES,
        athletes: [athleteInSlot],
        averageTravelMinutes: athleteInSlot.travelMinutes ?? 0,
        averageWalkingMinutes: athleteInSlot.walkingMinutes,
        averageDrivingMinutes: athleteInSlot.drivingMinutes,
      })
      break
    }
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
